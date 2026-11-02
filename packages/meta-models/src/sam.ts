// SAM 3.1 text-prompted segmentation over the Responses API.
// Output grammar: dev.meta.ai/docs/sam/reading-segmentation. We read box
// tokens only; masks are not needed to draw the valve ring.
import { MetaApiError, type MetaClient } from "./client.ts";

export const SAM_MODEL = "sam-3.1";

export type SamBox = { x1: number; y1: number; x2: number; y2: number };

export type SamDetection = {
  frame: number;
  objectId: number;
  box: SamBox;
  width: number;
  height: number;
  confidence: number | null;
};

export type SegmentImageInput = {
  // One noun phrase per request, e.g. "shut-off valve".
  concept: string;
  // https URL or data:image/...;base64 URL.
  imageUrl: string;
};

const FRAME_MARKER = /^<(\d+)f>/;
const BOX_RECORD = /(\d+)<\|box;([^|]*)\|>/g;

export function parseSamOutput(text: string): SamDetection[] {
  // Split on frame markers rather than newlines so stream chunks can be
  // joined as-is. Base85 mask payloads never contain "<|".
  const lines = text.split(/(?=<\d+f>)/).map((line) => line.trim());
  return lines.flatMap((line) => {
    const marker = FRAME_MARKER.exec(line);
    if (!marker) {
      return [];
    }
    const frame = Number(marker[1]);
    return [...line.matchAll(BOX_RECORD)].map((match) => toDetection(frame, Number(match[1]), match[2] ?? ""));
  });
}

function toDetection(frame: number, objectId: number, fields: string): SamDetection {
  const values = new Map(
    fields.split(";").map((pair) => {
      const [key = "", value = ""] = pair.split("=");
      return [key, value] as const;
    }),
  );
  const read = (key: string): number => {
    const value = Number(values.get(key));
    if (!values.has(key) || Number.isNaN(value)) {
      throw new Error(`SAM box token is missing ${key}: ${fields}`);
    }
    return value;
  };
  return {
    frame,
    objectId,
    box: { x1: read("x1"), y1: read("y1"), x2: read("x2"), y2: read("y2") },
    width: read("w"),
    height: read("h"),
    confidence: values.has("c") ? read("c") : null,
  };
}

export async function segmentImage(client: MetaClient, input: SegmentImageInput): Promise<SamDetection[]> {
  return segment(client, input.concept, input.imageUrl);
}

export type SegmentAtPointInput = {
  // Pixels in the image, with the image's own size (dev.meta.ai/docs/sam/segmenting).
  x: number;
  y: number;
  width: number;
  height: number;
  imageUrl: string;
};

// The object at one pixel, for when words find nothing: on a real sink's valves SAM
// returned nothing for "valve", and a box for each valve when pointed at it.
export async function segmentAtPoint(client: MetaClient, input: SegmentAtPointInput): Promise<SamDetection[]> {
  const prompt = `<0f>1<|point;x=${input.x};y=${input.y};w=${input.width};h=${input.height}|>`;
  return segment(client, prompt, input.imageUrl);
}

async function segment(client: MetaClient, prompt: string, imageUrl: string): Promise<SamDetection[]> {
  const body = {
    model: SAM_MODEL,
    input: [
      {
        type: "message",
        role: "user",
        content: [
          { type: "input_text", text: prompt },
          { type: "input_image", image_url: imageUrl },
        ],
      },
    ],
    stream: true,
    metadata: { include_confidence: "true", mask_encoding: "one_bit" },
  };
  const response = await client.post("/responses", JSON.stringify(body), {
    "content-type": "application/json",
    accept: "text/event-stream",
  });
  const contentType = response.headers.get("content-type") ?? "";
  const text = contentType.includes("text/event-stream")
    ? readOutputTextStream(await response.text())
    : readOutputTextJson(await response.json());
  return parseSamOutput(text);
}

type StreamEvent = {
  type?: string;
  delta?: string;
  error?: { type?: string; message?: string };
  response?: { error?: { type?: string; message?: string } };
};

function readOutputTextStream(raw: string): string {
  const events = raw
    .split(/\r?\n\r?\n/)
    .map((block) =>
      block
        .split(/\r?\n/)
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trim())
        .join(""),
    )
    .filter((data) => data !== "" && data !== "[DONE]")
    .map((data) => JSON.parse(data) as StreamEvent);

  const failure = events.find((event) => event.type === "error" || event.type === "response.failed");
  if (failure) {
    const error = failure.error ?? failure.response?.error;
    throw new MetaApiError(200, error?.type ?? null, `SAM stream failed: ${error?.message ?? "unknown error"}`);
  }
  return events
    .filter((event) => event.type === "response.output_text.delta")
    .map((event) => event.delta ?? "")
    .join("");
}

function readOutputTextJson(body: unknown): string {
  const parsed = body as {
    output_text?: string;
    output?: { content?: { type?: string; text?: string }[] }[];
  };
  if (typeof parsed.output_text === "string") {
    return parsed.output_text;
  }
  return (parsed.output ?? [])
    .flatMap((item) => item.content ?? [])
    .filter((part) => part.type === "output_text")
    .map((part) => part.text ?? "")
    .join("");
}
