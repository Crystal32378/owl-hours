// Async pipeline for one inbound WhatsApp message:
// download -> (voice: WAV + transcribe) | (image/video: frame + SAM valve) -> Spark agent.
// Every step is injected so the pipeline runs on fakes until credits land;
// live-deps.ts wires the real Meta Model API and ffmpeg.
import type { MediaTriage } from "../ai/media-triage.ts";
import { imagePart, textPart, type ChatMessage, type ContentPart } from "@owl-hours/meta-models";
import type { ValveResult } from "../ai/valve-step.ts";
import { AI_DISCLOSURE, CUSTOMER_SYSTEM_PROMPT } from "../agent/customer-agent.ts";

export type InboundMessage = {
  // Resolved by the webhook from the sender; tools are scoped to it.
  conversationId: string;
  type: "text" | "audio" | "image" | "video";
  text?: string | undefined;
  caption?: string | undefined;
  mediaId?: string | undefined;
  // Set by the webhook for the first inbound message of a conversation.
  firstInConversation?: boolean | undefined;
};

export type PipelineDeps = {
  downloadMedia: (mediaId: string) => Promise<string>;
  toWav: (audioPath: string) => Promise<string>;
  transcribe: (wavPath: string) => Promise<string>;
  // Spark's reading of the whole photo or video, with the customer's own words.
  triage: (mediaPath: string, mediaType: "image" | "video", caption: string | null) => Promise<MediaTriage>;
  // atSeconds defaults to a second in.
  extractFrame: (videoPath: string, atSeconds?: number) => Promise<string>;
  toDataUrl: (imagePath: string) => Promise<string>;
  // concept is the object Spark named; markValve has its own word without one.
  markValve: (framePath: string, imageUrl: string, concept?: string) => Promise<ValveResult>;
  // Uploads the marked frame; returns the URL for payload 04's image header.
  // With sourceMediaId it is also saved as that media's marked_frame row.
  publishImage: (conversationId: string, imagePath: string, sourceMediaId?: string) => Promise<string>;
  runAgent: (messages: ChatMessage[], conversationId: string) => Promise<{ reply: string }>;
};

export type PipelineResult = {
  transcript: string | null;
  // Send before anything else (payload 01) when set.
  disclosure: string | null;
  valve: ValveResult | null;
  markedFrameUrl: string | null;
  reply: string;
};

export async function processMessage(message: InboundMessage, deps: PipelineDeps): Promise<PipelineResult> {
  const { parts, transcript, valve } = await readMessage(message, deps);
  const messages: ChatMessage[] = [
    { role: "system", content: CUSTOMER_SYSTEM_PROMPT },
    { role: "user", content: parts },
  ];
  const markedFrameUrl =
    valve?.kind === "marked" ? await deps.publishImage(message.conversationId, valve.markedFramePath) : null;
  const { reply } = await deps.runAgent(messages, message.conversationId);
  const disclosure = message.firstInConversation ? AI_DISCLOSURE : null;
  return { transcript, disclosure, valve, markedFrameUrl, reply };
}

type ReadMessage = { parts: ContentPart[]; transcript: string | null; valve: ValveResult | null };

async function readMessage(message: InboundMessage, deps: PipelineDeps): Promise<ReadMessage> {
  if (message.type === "text") {
    return { parts: [textPart(message.text ?? "")], transcript: null, valve: null };
  }
  if (!message.mediaId) {
    throw new Error(`mediaId is required for ${message.type} messages`);
  }
  const mediaPath = await deps.downloadMedia(message.mediaId);
  const caption = message.caption ? [textPart(`Customer caption: ${message.caption}`)] : [];

  if (message.type === "audio") {
    const transcript = await deps.transcribe(await deps.toWav(mediaPath));
    return { parts: [textPart(`Customer voice note (transcribed): ${transcript}`)], transcript, valve: null };
  }

  const framePath = message.type === "video" ? await deps.extractFrame(mediaPath) : mediaPath;
  const imageUrl = await deps.toDataUrl(framePath);
  const valve = await deps.markValve(framePath, imageUrl);
  return {
    parts: [...caption, imagePart(imageUrl), textPart(describeValve(valve))],
    transcript: null,
    valve,
  };
}

export function describeValve(valve: ValveResult): string {
  if (valve.kind === "marked") {
    const confidence = valve.detection.confidence?.toFixed(2) ?? "unknown";
    return `Pipeline note: a shut-off valve was marked on this frame (confidence ${confidence}). The circled photo will be sent to the customer.`;
  }
  return `Pipeline note: the shut-off valve could not be marked with confidence. Do not point at a specific pipe. Give this general advice: ${valve.advice}`;
}
