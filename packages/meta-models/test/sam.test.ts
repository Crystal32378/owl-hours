// SAM 3.1 output parsing and the segment request (docs: dev.meta.ai/docs/sam/reading-segmentation).
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createMetaClient } from "../src/client.ts";
import { parseSamOutput, segmentImage, segmentAtPoint } from "../src/sam.ts";
import { fakeFetch, jsonResponse } from "./fake-fetch.ts";

const TWO_VALVES =
  "<0f>0<|box;x1=353;y1=382;x2=453;y2=427;w=537;h=561;c=0.91|><|mask;x=0;y=0;c=0.91;data=46,101,!ab~c|>," +
  "2<|box;x1=10;y1=20;x2=30;y2=40;w=537;h=561;c=0.4|><|mask;x=0;y=0;c=0.4;data=20,20,!x|>";

describe("parseSamOutput", () => {
  it("reads every box with its object id, frame and confidence", () => {
    const detections = parseSamOutput(TWO_VALVES);
    assert.deepEqual(detections, [
      { frame: 0, objectId: 0, box: { x1: 353, y1: 382, x2: 453, y2: 427 }, width: 537, height: 561, confidence: 0.91 },
      { frame: 0, objectId: 2, box: { x1: 10, y1: 20, x2: 30, y2: 40 }, width: 537, height: 561, confidence: 0.4 },
    ]);
  });

  it("returns no detections for an empty lane (zero matches is valid)", () => {
    assert.deepEqual(parseSamOutput(""), []);
  });

  it("leaves confidence null when the request did not ask for it", () => {
    const [first] = parseSamOutput("<0f>0<|box;x1=1;y1=2;x2=3;y2=4;w=10;h=10|><|mask;x=0;y=0;data=2,2,~zz|>");
    assert.equal(first?.confidence, null);
  });

  it("reads several frames of a video", () => {
    const text =
      "<0f>1<|box;x1=1;y1=1;x2=2;y2=2;w=9;h=9|><|mask;x=0;y=0;data=1,1,~a|>\n" +
      "<3f>1<|box;x1=4;y1=4;x2=5;y2=5;w=9;h=9|><|mask;x=0;y=0;data=1,1,~b|>";
    assert.deepEqual(
      parseSamOutput(text).map((d) => [d.frame, d.objectId]),
      [
        [0, 1],
        [3, 1],
      ],
    );
  });
});

function sseResponse(events: unknown[]): Response {
  const body = events.map((event) => `event: x\ndata: ${JSON.stringify(event)}\n\n`).join("");
  return new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } });
}

describe("segmentImage", () => {
  it("posts a concept prompt and an image to /responses and reads the stream", async () => {
    const fetch = fakeFetch(() =>
      sseResponse([
        { type: "response.created" },
        { type: "response.output_text.delta", delta: TWO_VALVES },
        { type: "response.completed" },
      ]),
    );
    const client = createMetaClient({ apiKey: "test-key", fetch: fetch.fn });

    const detections = await segmentImage(client, {
      concept: "shut-off valve",
      imageUrl: "data:image/jpeg;base64,AAAA",
    });

    assert.equal(detections.length, 2);
    const call = fetch.calls[0];
    assert.equal(call?.url, "https://api.meta.ai/v1/responses");
    assert.equal(call?.headers.accept, "text/event-stream");
    const body = call?.json as Record<string, unknown>;
    assert.equal(body.model, "sam-3.1");
    assert.equal(body.stream, true);
    assert.deepEqual(body.metadata, { include_confidence: "true", mask_encoding: "one_bit" });
    assert.deepEqual(body.input, [
      {
        type: "message",
        role: "user",
        content: [
          { type: "input_text", text: "shut-off valve" },
          { type: "input_image", image_url: "data:image/jpeg;base64,AAAA" },
        ],
      },
    ]);
  });

  it("returns no detections when the stream completes with an empty lane", async () => {
    const fetch = fakeFetch(() => sseResponse([{ type: "response.completed" }]));
    const client = createMetaClient({ apiKey: "k", fetch: fetch.fn });
    assert.deepEqual(await segmentImage(client, { concept: "valve", imageUrl: "data:x" }), []);
  });

  it("surfaces an error event from the stream", async () => {
    const fetch = fakeFetch(() =>
      sseResponse([{ type: "error", error: { type: "server_error", message: "overloaded" } }]),
    );
    const client = createMetaClient({ apiKey: "k", fetch: fetch.fn });
    await assert.rejects(segmentImage(client, { concept: "valve", imageUrl: "data:x" }), /overloaded/);
  });

  it("still reads a plain JSON response", async () => {
    const fetch = fakeFetch(() =>
      jsonResponse({ output: [{ type: "message", content: [{ type: "output_text", text: TWO_VALVES }] }] }),
    );
    const client = createMetaClient({ apiKey: "k", fetch: fetch.fn });
    assert.equal((await segmentImage(client, { concept: "valve", imageUrl: "data:x" })).length, 2);
  });
});

describe("segmentAtPoint", () => {
  it("asks SAM for the object at a pixel, using the point prompt on frame 0", async () => {
    const fetch = fakeFetch(
      () =>
        new Response('data: {"type":"response.output_text.delta","delta":"<0f>1<|box;x1=23;y1=165;x2=108;y2=277;w=576;h=1024;c=0.68|>"}\n\n', {
          headers: { "content-type": "text/event-stream" },
        }),
    );
    const client = createMetaClient({ apiKey: "k", fetch: fetch.fn });

    const detections = await segmentAtPoint(client, { x: 61, y: 220, width: 576, height: 1024, imageUrl: "data:image/jpeg;base64,AAAA" });

    assert.deepEqual(detections.map((d) => d.box), [{ x1: 23, y1: 165, x2: 108, y2: 277 }]);
    const [message] = (fetch.calls[0]?.json as { input: { content: unknown[] }[] }).input;
    assert.deepEqual(message?.content[0], { type: "input_text", text: "<0f>1<|point;x=61;y=220;w=576;h=1024|>" });
  });
});

