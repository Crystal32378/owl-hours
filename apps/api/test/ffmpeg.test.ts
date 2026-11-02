// ffmpeg argument builders. The real binary is not run in unit tests.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { extractFrame, extractFrameArgs, runProcess, toWavArgs } from "../src/media/ffmpeg.ts";

describe("ffmpeg args", () => {
  it("extracts one JPEG frame at the given second", () => {
    assert.deepEqual(extractFrameArgs("in.mp4", "out.jpg", 1.5), [
      "-y", "-ss", "1.5", "-i", "in.mp4", "-frames:v", "1", "-q:v", "2", "out.jpg",
    ]);
  });

  it("converts any audio to mono 16-bit 24 kHz WAV for Voice Transcribe", () => {
    assert.deepEqual(toWavArgs("note.ogg", "note.wav"), [
      "-y", "-i", "note.ogg", "-ac", "1", "-ar", "24000", "-c:a", "pcm_s16le", "-map_metadata", "-1", "note.wav",
    ]);
  });
});

describe("runProcess", () => {
  it("kills a process that runs past the timeout", async () => {
    const started = Date.now();
    await assert.rejects(
      runProcess(process.execPath, ["-e", "setTimeout(() => {}, 10000)"], 200),
      /timed out after 200 ms/,
    );
    assert.ok(Date.now() - started < 5000, "did not wait for the process");
  });

  it("reports the end of stderr when the process fails", async () => {
    await assert.rejects(
      runProcess(process.execPath, ["-e", "console.error('bad input'); process.exit(3)"], 5000),
      /bad input/,
    );
  });
});

describe("extractFrame", () => {
  const framePath = async () => join(await mkdtemp(join(tmpdir(), "frame-")), "out.jpg");
  const secondOf = (args: string[]) => Number(args[args.indexOf("-ss") + 1]);

  it("takes the frame at the second it was asked for", async () => {
    const output = await framePath();
    const seconds: number[] = [];

    await extractFrame("in.mp4", output, 7, async (args) => {
      seconds.push(secondOf(args));
      await writeFile(output, "jpg");
    });

    assert.deepEqual(seconds, [7]);
    assert.equal(existsSync(output), true);
  });

  it("falls back to earlier frames when the second is past the end, where ffmpeg writes nothing and still exits 0", async () => {
    const output = await framePath();
    const seconds: number[] = [];

    await extractFrame("in.mp4", output, 90, async (args) => {
      const second = secondOf(args);
      seconds.push(second);
      if (second === 0) await writeFile(output, "jpg");
    });

    assert.deepEqual(seconds, [90, 1, 0]);
  });

  it("falls back when ffmpeg fails, and starts one second in when no second is given", async () => {
    const output = await framePath();
    const seconds: number[] = [];

    await extractFrame("in.mp4", output, undefined, async (args) => {
      const second = secondOf(args);
      seconds.push(second);
      if (second === 1) throw new Error("clip too short");
      await writeFile(output, "jpg");
    });

    assert.deepEqual(seconds, [1, 0]);
  });

  it("fails when no frame can be taken", async () => {
    await assert.rejects(extractFrame("in.mp4", await framePath(), undefined, async () => {}), /no frame/);
  });

  it("does not trust a file ffmpeg left behind when it failed", async () => {
    const output = await framePath();
    const seconds: number[] = [];

    await extractFrame("in.mp4", output, 5, async (args) => {
      const second = secondOf(args);
      seconds.push(second);
      await writeFile(output, second === 5 ? "partial" : "jpg");
      if (second === 5) throw new Error("corrupt stream");
    });

    assert.deepEqual(seconds, [5, 1]);
  });

  it("reports ffmpeg's own error when every try fails", async () => {
    await assert.rejects(
      extractFrame("in.mp4", await framePath(), undefined, async () => {
        throw new Error("ffmpeg: not found");
      }),
      (error: Error) => error.cause instanceof Error && /ffmpeg: not found/.test(error.cause.message),
    );
  });
});
