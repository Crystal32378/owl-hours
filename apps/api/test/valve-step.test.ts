// Valve marking: pick SAM's best box, draw our own ring on the real frame,
// and fall back to generic advice when SAM is unsure (never guess a valve).
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { SamDetection } from "@owl-hours/meta-models";
import { GENERIC_VALVE_ADVICE, markValve, pickValve } from "../src/ai/valve-step.ts";

function detection(objectId: number, confidence: number | null): SamDetection {
  return {
    frame: 0,
    objectId,
    box: { x1: 100, y1: 200, x2: 180, y2: 260 },
    width: 640,
    height: 480,
    confidence,
  };
}

describe("pickValve", () => {
  it("picks the most confident detection above the threshold", () => {
    const best = pickValve([detection(0, 0.6), detection(3, 0.92), detection(5, 0.7)], 0.5);
    assert.equal(best?.objectId, 3);
  });

  it("returns null when every detection is below the threshold", () => {
    assert.equal(pickValve([detection(0, 0.3)], 0.5), null);
  });

  it("returns null when confidence is missing, since we cannot judge it", () => {
    assert.equal(pickValve([detection(0, null)], 0.5), null);
  });

  it("returns null for no detections", () => {
    assert.equal(pickValve([], 0.5), null);
  });
});

describe("markValve at Spark's points", () => {
  const VALVES = [{ x: 106, y: 215 }, { x: 880, y: 255 }];
  const FRAME = { width: 576, height: 1024 };

  it("converts Spark's 0-1000 points to pixels, asks SAM at each and circles every valve", async () => {
    const asked: unknown[] = [];
    let rings = 0;
    let labels = 0;

    const result = await markValve({
      framePath: "/tmp/frame.jpg",
      imageUrl: "data:x",
      locate: async () => VALVES,
      frameSize: async () => FRAME,
      segmentAt: async (point) => {
        asked.push(point);
        const left = asked.length * 100;
        return [{ ...detection(asked.length, 0.65), box: { x1: left, y1: 200, x2: left + 80, y2: 260 } }];
      },
      segment: async () => {
        throw new Error("words are only the fallback");
      },
      drawOverlay: async (_frame, svgFor) => {
        const svg = svgFor(576, 1024);
        rings = (svg.match(/<circle [^>]*stroke="#FF3B30"/g) ?? []).length;
        labels = (svg.match(/<text /g) ?? []).length;
        return "/tmp/marked.jpg";
      },
    });

    assert.deepEqual(asked, [{ x: 61, y: 220, ...FRAME }, { x: 507, y: 261, ...FRAME }]);
    assert.equal(result.kind, "marked");
    assert.equal(rings, 2);
    assert.equal(labels, 1);
  });

  it("falls back to words when Spark sees nothing, tries the broader phrase first, and stops at the first find", async () => {
    const concepts: string[] = [];

    const result = await markValve({
      framePath: "/tmp/frame.jpg",
      imageUrl: "data:x",
      locate: async () => [],
      frameSize: async () => FRAME,
      segmentAt: async () => [],
      segment: async (concept) => {
        concepts.push(concept);
        return concept === "plumbing valve" ? [detection(0, 0.7)] : [];
      },
      drawOverlay: async () => "/tmp/marked.jpg",
    });

    assert.deepEqual(concepts, ["plumbing valve"]);
    assert.equal(result.kind, "marked");
  });

  it("falls back to words when locating fails", async () => {
    const result = await markValve({
      framePath: "/tmp/frame.jpg",
      imageUrl: "data:x",
      locate: async () => {
        throw new Error("Spark is down");
      },
      frameSize: async () => FRAME,
      segmentAt: async () => [],
      segment: async () => [detection(0, 0.7)],
      drawOverlay: async () => "/tmp/marked.jpg",
    });

    assert.equal(result.kind, "marked");
  });

  const marked = async (over: Partial<Parameters<typeof markValve>[0]>) => {
    let svg = "";
    const result = await markValve({
      framePath: "/tmp/frame.jpg",
      imageUrl: "data:x",
      locate: async () => VALVES,
      frameSize: async () => FRAME,
      segmentAt: async () => [detection(0, 0.7)],
      segment: async () => [],
      drawOverlay: async (_frame, svgFor) => {
        svg = svgFor(576, 1024);
        return "/tmp/marked.jpg";
      },
      ...over,
    });
    return { result, rings: (svg.match(/<circle [^>]*stroke="#FF3B30"/g) ?? []).length };
  };

  it("ignores a box too big to be a valve: the point missed and SAM took the wall", async () => {
    const wall = { ...detection(0, 0.9), box: { x1: 0, y1: 0, x2: 576, y2: 600 }, width: 576, height: 1024 };

    const { result } = await marked({ segmentAt: async () => [wall] });

    assert.equal(result.kind, "fallback");
  });

  it("keeps a real valve shot close up, at under half the frame", async () => {
    const closeUp = { ...detection(0, 0.8), box: { x1: 100, y1: 100, x2: 500, y2: 700 }, width: 576, height: 1024 };

    const { result } = await marked({ locate: async () => [{ x: 500, y: 400 }], segmentAt: async () => [closeUp] });

    assert.equal(result.kind, "marked");
  });

  it("keeps a valve inside a larger box, whichever point came first", async () => {
    const fixture = { ...detection(0, 0.7), box: { x1: 0, y1: 0, x2: 300, y2: 300 }, width: 576, height: 1024 };
    const valve = { ...detection(1, 0.7), box: { x1: 100, y1: 100, x2: 160, y2: 160 }, width: 576, height: 1024 };
    let calls = 0;

    const { rings } = await marked({
      segmentAt: async () => {
        calls += 1;
        return [calls === 1 ? fixture : valve];
      },
    });

    assert.equal(rings, 2);
  });

  it("circles one valve when two points land on it", async () => {
    const { rings } = await marked({});

    assert.equal(rings, 1);
  });

  it("asks SAM about four points at most", async () => {
    let asked = 0;

    await marked({
      locate: async () => Array.from({ length: 9 }, (_, i) => ({ x: i * 100, y: 500 })),
      segmentAt: async () => {
        asked += 1;
        return [];
      },
    });

    assert.equal(asked, 4);
  });

  it("keeps the valves SAM found when another point fails, and logs the failure", async (t) => {
    const warnings: string[] = [];
    t.mock.method(console, "warn", (message: string) => warnings.push(message));
    let calls = 0;

    const { result } = await marked({
      segmentAt: async () => {
        calls += 1;
        if (calls === 1) throw new Error("SAM hiccup");
        return [detection(0, 0.7)];
      },
    });

    assert.equal(result.kind, "marked");
    assert.match(warnings.join(), /SAM hiccup/);
  });

  it("logs a failed Spark reading of the points", async (t) => {
    const warnings: string[] = [];
    t.mock.method(console, "warn", (message: string) => warnings.push(message));

    await marked({
      locate: async () => {
        throw new Error("Spark is down");
      },
    });

    assert.match(warnings.join(), /Spark is down/);
  });

  it("tries the next word when SAM fails on one", async (t) => {
    t.mock.method(console, "warn", () => {});
    const concepts: string[] = [];

    const { result } = await marked({
      locate: async () => [],
      segment: async (concept) => {
        concepts.push(concept);
        if (concept === "plumbing valve") throw new Error("SAM hiccup");
        return [detection(0, 0.7)];
      },
    });

    assert.deepEqual(concepts, ["plumbing valve", "valve"]);
    assert.equal(result.kind, "marked");
  });

  it("ignores a point SAM is unsure about", async () => {
    const result = await markValve({
      framePath: "/tmp/frame.jpg",
      imageUrl: "data:x",
      locate: async () => [{ x: 500, y: 500 }],
      frameSize: async () => FRAME,
      segmentAt: async () => [detection(0, 0.2)],
      segment: async () => [],
      drawOverlay: async () => "/tmp/marked.jpg",
    });

    assert.equal(result.kind, "fallback");
  });
});

describe("markValve", () => {
  it("asks SAM for the words that find real valves, broadest first", async () => {
    const concepts: string[] = [];

    await markValve({
      framePath: "/tmp/frame.jpg",
      imageUrl: "data:image/jpeg;base64,AAAA",
      segment: async (concept) => {
        concepts.push(concept);
        return [];
      },
      drawOverlay: async () => "/tmp/marked.jpg",
    });

    assert.deepEqual(concepts, ["plumbing valve", "valve"]);
  });

  it("uses the object name it is given", async () => {
    const concepts: string[] = [];

    await markValve({
      framePath: "/tmp/frame.jpg",
      imageUrl: "data:image/jpeg;base64,AAAA",
      concept: "angle stop",
      segment: async (concept) => {
        concepts.push(concept);
        return [];
      },
      drawOverlay: async () => "/tmp/marked.jpg",
    });

    assert.deepEqual(concepts, ["angle stop", "plumbing valve", "valve"]);
  });

  it("gives advice that fits a photo as well as a video", () => {
    assert.doesNotMatch(GENERIC_VALVE_ADVICE, /your video/);
  });

  it("returns the marked frame when SAM is confident", async () => {
    const drawn: string[] = [];
    const result = await markValve({
      framePath: "frame.jpg",
      imageUrl: "data:image/jpeg;base64,AA",
      segment: async () => [detection(1, 0.88)],
      drawOverlay: async (framePath, svgFor) => {
        drawn.push(`${framePath}|${svgFor(1280, 960)}`);
        return "frame-marked.jpg";
      },
    });

    assert.equal(result.kind, "marked");
    if (result.kind === "marked") {
      assert.equal(result.markedFramePath, "frame-marked.jpg");
      assert.equal(result.detection.objectId, 1);
    }
    assert.equal(drawn.length, 1);
    // SAM's 640x480 coordinates drawn on the real 1280x960 frame: ring, arrow, label.
    assert.match(drawn[0] ?? "", /^frame\.jpg\|<svg [^>]*width="1280" height="960" viewBox="0 0 640 480"/);
    assert.match(drawn[0] ?? "", /<circle [^>]*stroke="#FF3B30"/);
    assert.match(drawn[0] ?? "", /<polygon /);
    assert.match(drawn[0] ?? "", />Shut-off valve<\/text>/);
  });

  it("falls back to generic advice and draws nothing when SAM is unsure", async () => {
    let drew = false;
    const result = await markValve({
      framePath: "frame.jpg",
      imageUrl: "data:x",
      segment: async () => [detection(1, 0.2)],
      drawOverlay: async () => {
        drew = true;
        return "x";
      },
    });

    assert.deepEqual(result, { kind: "fallback", advice: GENERIC_VALVE_ADVICE });
    assert.equal(drew, false);
  });

});
