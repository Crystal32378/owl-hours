// Spark's reading of a customer's photo or video (odd/tasks/whatsapp-media-triage.md S3, S5).
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { CATEGORIES } from "@owl-hours/shared";
import { locateValves, triageMedia } from "../src/ai/media-triage.ts";

const OVERFLOW = {
  problem: "Toilet overflowing onto the floor",
  customerMessage: "Tu excusado se está derramando. Cierra la llave y no lo uses.",
  severity: "emergency",
  waterShutOff: "helps",
  valveObject: "valve",
  bestSeconds: 4,
};

const answering = (answer: unknown) => async () => JSON.stringify(answer);

describe("triageMedia", () => {
  it("answers Spark's reading of the media", async () => {
    const triage = await triageMedia(answering(OVERFLOW), { mediaType: "video", mediaUrl: "u", caption: null });

    assert.deepEqual(triage, OVERFLOW);
  });

  it("passes the media through and gives Spark the customer's words", async () => {
    const seen: { prompt: string; mediaType: string; mediaUrl: string }[] = [];

    await triageMedia(
      async (input) => {
        seen.push(input);
        return JSON.stringify(OVERFLOW);
      },
      { mediaType: "video", mediaUrl: "data:video/mp4;base64,AAAA", caption: "se está derramando mi excusado" },
    );

    assert.equal(seen[0]?.mediaType, "video");
    assert.equal(seen[0]?.mediaUrl, "data:video/mp4;base64,AAAA");
    assert.match(seen[0]?.prompt ?? "", /se está derramando mi excusado/);
  });

  it("tells Spark that the customer's words about a leak outweigh what it cannot see", async () => {
    const prompts: string[] = [];

    await triageMedia(
      async (input) => {
        prompts.push(input.prompt);
        return JSON.stringify(OVERFLOW);
      },
      { mediaType: "video", mediaUrl: "u", caption: "Mi llave gotea sin parar" },
    );

    assert.match(prompts[0] ?? "", /never answer wont_help because you cannot see it/);
  });

  it("covers every category and carries the safety rules, whatever the media shows", async () => {
    const prompts: string[] = [];

    await triageMedia(
      async (input) => {
        prompts.push(input.prompt);
        return JSON.stringify(OVERFLOW);
      },
      { mediaType: "image", mediaUrl: "u", caption: null },
    );

    for (const category of CATEGORIES) assert.match(prompts[0] ?? "", new RegExp(category));
    assert.match(prompts[0] ?? "", /exposed wires/);
    assert.match(prompts[0] ?? "", /smell gas/);
    assert.match(prompts[0] ?? "", /Never diagnose a pet or a person/);
    assert.match(prompts[0] ?? "", /wont_help when .* not about water/);
  });

  it("treats a valve name made only of spaces as no valve", async () => {
    const triage = await triageMedia(answering({ ...OVERFLOW, valveObject: "  " }), {
      mediaType: "image",
      mediaUrl: "u",
      caption: null,
    });

    assert.equal(triage.valveObject, null);
  });

  it("rejects an answer outside the contract, so the caller falls back", async () => {
    await assert.rejects(
      triageMedia(answering({ ...OVERFLOW, waterShutOff: "maybe" }), { mediaType: "image", mediaUrl: "u", caption: null }),
    );
    await assert.rejects(triageMedia(async () => "not json", { mediaType: "image", mediaUrl: "u", caption: null }));
  });
});

describe("locateValves", () => {
  it("sends the frame as an image and answers the points", async () => {
    const seen: { mediaType: string; mediaUrl: string }[] = [];

    const points = await locateValves(
      async (input) => {
        seen.push(input);
        return JSON.stringify({ valves: [{ x: 106, y: 215 }] });
      },
      "data:image/jpeg;base64,AAAA",
    );

    assert.deepEqual(points, [{ x: 106, y: 215 }]);
    assert.deepEqual([seen[0]?.mediaType, seen[0]?.mediaUrl], ["image", "data:image/jpeg;base64,AAAA"]);
  });

  it("drops a point outside the frame", async () => {
    const points = await locateValves(async () => JSON.stringify({ valves: [{ x: 1200, y: 215 }, { x: 10, y: 20 }] }), "u");

    assert.deepEqual(points, [{ x: 10, y: 20 }]);
  });
});

