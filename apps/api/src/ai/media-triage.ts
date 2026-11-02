// Spark reads the customer's whole photo or video before anything else looks at it: what is wrong,
// whether closing the water would stop it, and where SAM should look for the valve
// (https://dev.meta.ai/docs/sam/segmenting: SAM locates what it is told to, Spark reasons about the scene).
import { z } from "zod";
import type { UnderstandMediaInput } from "@owl-hours/meta-models";

const SEVERITIES = ["emergency", "urgent", "routine", "none"] as const;
const SHUT_OFF_ANSWERS = ["helps", "wont_help", "unclear"] as const;

const triageSchema = z.object({
  problem: z.string().min(1),
  customerMessage: z.string().min(1),
  severity: z.enum(SEVERITIES),
  waterShutOff: z.enum(SHUT_OFF_ANSWERS),
  valveObject: z.string().nullable(),
  bestSeconds: z.number().nonnegative().nullable(),
});

export type MediaTriage = z.infer<typeof triageSchema>;

export type TriageInput = { mediaType: "image" | "video"; mediaUrl: string; caption: string | null };

const TRIAGE_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["problem", "customerMessage", "severity", "waterShutOff", "valveObject", "bestSeconds"],
  properties: {
    problem: { type: "string" },
    customerMessage: { type: "string" },
    severity: { type: "string", enum: SEVERITIES },
    waterShutOff: { type: "string", enum: SHUT_OFF_ANSWERS },
    valveObject: { type: ["string", "null"] },
    bestSeconds: { type: ["number", "null"] },
  },
};

const TRIAGE_PROMPT = [
  "A customer sent this to a home-repair assistant. Describe only what is visible or audible; do not assume a cause you cannot see.",
  "problem: one short sentence on what is wrong.",
  "customerMessage: for the customer, in the language they wrote in (English if they wrote nothing), one or two short plain sentences: what you see and what they can do right now. No prices, no business names, and no promise that help is on the way.",
  "severity: emergency when water or danger is spreading now, urgent when it needs help today, routine when it can wait, none when nothing is wrong.",
  "waterShutOff: helps when closing a water supply valve would stop this problem. wont_help when it clearly would not, such as rain, a roof or gutter, an old stain, or nothing wrong. unclear in every other case, and whenever you doubt. If the customer says water is leaking or flowing from a pipe, faucet, toilet or fixture, never answer wont_help because you cannot see it: answer helps, or unclear if their words leave it open.",
  "valveObject: the shortest plain noun for a water shut-off valve you can clearly see, such as valve. Null when none is clearly visible.",
  "bestSeconds: for a video, the second where that valve, or otherwise the problem, is clearest. Null for a photo.",
].join("\n");

export async function triageMedia(
  understand: (input: UnderstandMediaInput) => Promise<string>,
  input: TriageInput,
): Promise<MediaTriage> {
  const answer = await understand({
    prompt: input.caption ? `${TRIAGE_PROMPT}\nThe customer wrote: ${input.caption}` : TRIAGE_PROMPT,
    mediaType: input.mediaType,
    mediaUrl: input.mediaUrl,
    schemaName: "media_triage",
    schema: TRIAGE_JSON_SCHEMA,
  });
  const triage = triageSchema.parse(JSON.parse(answer));
  return { ...triage, valveObject: triage.valveObject?.trim() || null };
}

const pointSchema = z.object({ x: z.number().min(0).max(1000), y: z.number().min(0).max(1000) });

const LOCATE_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["valves"],
  properties: {
    valves: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["x", "y"],
        properties: { x: { type: "number" }, y: { type: "number" } },
      },
    },
  },
};

const LOCATE_PROMPT =
  "Locate every water shut-off valve you can clearly see, often a small handle or knob on a supply line. Give the centre of each handle as x and y, each from 0 to 1000 relative to the image width and height. An empty list if there is none.";

// On the chosen frame, not the video: the same valves came back far off when read from the whole video.
export async function locateValves(
  understand: (input: UnderstandMediaInput) => Promise<string>,
  frameUrl: string,
): Promise<{ x: number; y: number }[]> {
  const answer = await understand({
    prompt: LOCATE_PROMPT,
    mediaType: "image",
    mediaUrl: frameUrl,
    schemaName: "valve_points",
    schema: LOCATE_JSON_SCHEMA,
  });
  const { valves } = z.object({ valves: z.array(z.unknown()) }).parse(JSON.parse(answer));
  return valves.flatMap((valve) => {
    const point = pointSchema.safeParse(valve);
    return point.success ? [point.data] : [];
  });
}

