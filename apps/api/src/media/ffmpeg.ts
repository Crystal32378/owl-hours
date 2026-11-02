// ffmpeg wrappers for the media steps. Arg builders are pure so they can
// be tested without the binary; runFfmpeg needs ffmpeg on PATH (or
// FFMPEG_PATH).
import { existsSync } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export function extractFrameArgs(input: string, output: string, atSeconds: number): string[] {
  return ["-y", "-ss", String(atSeconds), "-i", input, "-frames:v", "1", "-q:v", "2", output];
}

// Voice Transcribe wants mono 16-bit PCM WAV at 16 or 24 kHz.
// A second in skips the blurry first frame most phone videos start with.
const DEFAULT_FRAME_SECONDS = 1;

// Tries the asked second, then one second in, then the first frame. Past the end of a clip
// ffmpeg writes no file and still exits 0, so success needs both a clean exit and the file.
export async function extractFrame(
  input: string,
  output: string,
  atSeconds: number | undefined,
  run: (args: string[]) => Promise<void> = runFfmpeg,
): Promise<void> {
  const seconds = new Set([atSeconds ?? DEFAULT_FRAME_SECONDS, DEFAULT_FRAME_SECONDS, 0]);
  let lastError: unknown = null;
  for (const second of seconds) {
    try {
      await run(extractFrameArgs(input, output, second));
      if (existsSync(output)) return;
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(`ffmpeg took no frame from ${input}`, { cause: lastError });
}

export function toWavArgs(input: string, output: string): string[] {
  return ["-y", "-i", input, "-ac", "1", "-ar", "24000", "-c:a", "pcm_s16le", "-map_metadata", "-1", output];
}

// One frame or a short voice note takes well under a second; a file that
// makes ffmpeg hang must not hold up the customer's conversation.
export const FFMPEG_TIMEOUT_MS = 30_000;

export async function runFfmpeg(args: string[], bin = process.env.FFMPEG_PATH ?? "ffmpeg"): Promise<void> {
  try {
    await runProcess(bin, ["-hide_banner", "-loglevel", "error", ...args], FFMPEG_TIMEOUT_MS);
  } catch (error) {
    throw new Error(`ffmpeg failed (${args.at(-1) ?? "no output"}): ${(error as Error).message}`);
  }
}

// Runs a program and kills it after timeoutMs.
export async function runProcess(bin: string, args: string[], timeoutMs: number): Promise<void> {
  try {
    await execFileAsync(bin, args, { windowsHide: true, timeout: timeoutMs, killSignal: "SIGKILL" });
  } catch (error) {
    const failure = error as { killed?: boolean; stderr?: string };
    if (failure.killed) {
      throw new Error(`timed out after ${timeoutMs} ms`);
    }
    throw new Error(failure.stderr?.trim().slice(-500) || String(error));
  }
}
