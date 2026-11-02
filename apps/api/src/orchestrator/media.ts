// Reads a stored photo, video or voice note for the orchestrator: voice is transcribed. When the
// need may be a leak, Spark reads the whole photo or video first: it says whether closing the water
// helps, and picks the frame and the object SAM marks. The download's temp folder is always removed.
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname } from "node:path";
import { imagePart, textPart, type ContentPart } from "@owl-hours/meta-models";
import type { MediaTriage } from "../ai/media-triage.ts";
import { GENERIC_VALVE_ADVICE, type ValveResult } from "../ai/valve-step.ts";
import { describeValve, type PipelineDeps } from "../worker/process-message.ts";
import type { MediaReading, RespondDeps } from "./types.ts";

export const TEMP_PREFIX = "zukki-";

type Warn = Pick<RespondDeps["log"], "warn">;
type ReadInput = Parameters<RespondDeps["readMedia"]>[0];

export function createMediaReader(pipeline: PipelineDeps, log: Warn = console): RespondDeps["readMedia"] {
  return async (input) => {
    const path = await pipeline.downloadMedia(input.mediaId);
    try {
      return await read(pipeline, log, path, input);
    } finally {
      await removeTempFolder(path);
    }
  };
}

async function read(pipeline: PipelineDeps, log: Warn, path: string, input: ReadInput): Promise<MediaReading> {
  if (input.mediaType === "audio") {
    const transcript = await pipeline.transcribe(await pipeline.toWav(path));
    return {
      parts: [textPart(`Customer voice note (transcribed): ${transcript}`)],
      transcript,
      markedFrameUrl: null,
      valveAdvice: null,
      shutOffWontHelp: false,
      analysis: null,
      serious: false,
    };
  }
  const mediaType = input.mediaType;
  const triage = input.findValve ? await triageOrNull(pipeline, log, path, mediaType, input) : null;
  const framePath = mediaType === "video" ? await frameOf(pipeline, path, triage) : path;
  const imageUrl = await pipeline.toDataUrl(framePath);
  const parts: ContentPart[] = [
    ...(input.caption ? [textPart(`Customer caption: ${input.caption}`)] : []),
    imagePart(imageUrl),
    ...(triage ? [textPart(`Pipeline note: the customer's media shows: ${triage.problem} Severity: ${triage.severity}.`)] : []),
  ];
  const wontHelp = triage?.waterShutOff === "wont_help";
  if (wontHelp) {
    parts.push(textPart("Pipeline note: closing a water valve will not stop this. Do not tell the customer to close a valve to stop it."));
  }
  const reading = {
    parts,
    transcript: null,
    markedFrameUrl: null,
    valveAdvice: null,
    shutOffWontHelp: wontHelp,
    analysis: triage?.customerMessage ?? null,
    serious: triage?.severity === "emergency" || triage?.severity === "urgent",
  };
  if (!input.findValve || triage?.severity === "none" || (wontHelp && !triage?.valveObject)) return reading;
  const valve = await findValve(pipeline, log, framePath, imageUrl, triage);
  if (valve.kind === "marked") {
    parts.push(textPart(describeValve(valve)));
    const markedFrameUrl = await pipeline.publishImage(input.conversationId, valve.markedFramePath, input.mediaId);
    return { ...reading, markedFrameUrl };
  }
  if (wontHelp) return reading;
  parts.push(textPart(describeValve(valve)));
  return { ...reading, valveAdvice: valve.advice };
}

// A failed reading never stops the customer: the path without it still looks for the valve.
async function triageOrNull(
  pipeline: PipelineDeps,
  log: Warn,
  path: string,
  mediaType: "image" | "video",
  input: ReadInput,
): Promise<MediaTriage | null> {
  try {
    return await pipeline.triage(path, mediaType, input.caption);
  } catch (error) {
    log.warn(`zukki: media triage failed for ${input.mediaId}: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

function frameOf(pipeline: PipelineDeps, path: string, triage: MediaTriage | null): Promise<string> {
  return triage?.bestSeconds == null ? pipeline.extractFrame(path) : pipeline.extractFrame(path, triage.bestSeconds);
}

// A valve Spark did not see is not worth asking for, and a failed SAM call costs
// the customer the circle, never the advice.
async function findValve(
  pipeline: PipelineDeps,
  log: Warn,
  framePath: string,
  imageUrl: string,
  triage: MediaTriage | null,
): Promise<ValveResult> {
  if (triage && !triage.valveObject) return { kind: "fallback", advice: GENERIC_VALVE_ADVICE };
  try {
    return await pipeline.markValve(framePath, imageUrl, triage?.valveObject ?? undefined);
  } catch (error) {
    log.warn(`zukki: valve marking failed: ${error instanceof Error ? error.message : String(error)}`);
    return { kind: "fallback", advice: GENERIC_VALVE_ADVICE };
  }
}

// Only folders this module's downloads create (os.tmpdir()/zukki-*).
async function removeTempFolder(path: string): Promise<void> {
  const folder = dirname(path);
  if (dirname(folder) === tmpdir() && basename(folder).startsWith(TEMP_PREFIX)) {
    await rm(folder, { recursive: true, force: true });
  }
}
