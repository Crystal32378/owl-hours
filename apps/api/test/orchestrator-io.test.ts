// The orchestrator's edges: Spark's reading of the need, the Supabase store,
// the media reader and the per-conversation queue.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ChatRequest, ContentPart } from "@owl-hours/meta-models";
import { GENERIC_VALVE_ADVICE } from "../src/ai/valve-step.ts";
import { historyMessages, historyText } from "../src/orchestrator/history.ts";
import { createMediaReader } from "../src/orchestrator/media.ts";
import { createSerializer } from "../src/orchestrator/serial.ts";
import { shutOffWontHelp } from "../src/orchestrator/copy.ts";
import { createConversationStore, readFacts } from "../src/orchestrator/store.ts";
import { understandNeed } from "../src/orchestrator/understand.ts";
import type { PipelineDeps } from "../src/worker/process-message.ts";
import { fakeSupabase } from "./helpers/fake-supabase.ts";

const CHAT = "40000000-0000-4000-8000-000000000001";
const MEDIA = "60000000-0000-4000-8000-000000000001";
const NORTHSIDE = "10000000-0000-4000-8000-000000000001";
const quiet = { info: () => {}, warn: () => {}, error: () => {} };

describe("understandNeed", () => {
  it("asks Spark for structured JSON and maps it", async () => {
    const requests: ChatRequest[] = [];
    const chat = async (request: ChatRequest) => {
      requests.push(request);
      return {
        finishReason: "stop",
        message: {
          role: "assistant" as const,
          content: '{"on_topic":true,"category":"plumbing","urgent":true,"title":"  Toilet won\'t stop running ","summary":"Water is reaching the hallway."}',
        },
      };
    };
    const result = await understandNeed(chat, {
      history: [{ from: "zukki", text: "Hi, I'm Zukki" }],
      parts: [{ type: "text", text: "my toilet won't stop" }],
      knownCategory: null,
    });
    assert.deepEqual(result, {
      onTopic: true,
      category: "plumbing",
      urgent: true,
      title: "Toilet won't stop running",
      summary: "Water is reaching the hallway.",
    });
    assert.equal(requests[0]?.responseFormat?.type, "json_schema");
    assert.equal(requests[0]?.temperature, 0);
  });

  it("accepts JSON in a code fence and turns empty text into null", async () => {
    const chat = async () => ({
      finishReason: "stop",
      message: { role: "assistant" as const, content: '```json\n{"on_topic":true,"category":null,"urgent":false,"title":"","summary":" "}\n```' },
    });
    const result = await understandNeed(chat, { history: [], parts: [{ type: "text", text: "hi" }], knownCategory: null });
    assert.deepEqual(result, { onTopic: true, category: null, urgent: false, title: null, summary: null });
  });

  it("throws on an answer that is not the schema", async () => {
    const chat = async () => ({ finishReason: "stop", message: { role: "assistant" as const, content: "I think it's plumbing" } });
    await assert.rejects(understandNeed(chat, { history: [], parts: [], knownCategory: null }));
  });
});

describe("history", () => {
  it("maps the chat to Spark roles and to a transcript", () => {
    const history = [
      { from: "customer" as const, text: "leak!" },
      { from: "zukki" as const, text: "Turn the valve." },
      { from: "owner" as const, text: "On my way" },
    ];
    assert.deepEqual(historyMessages(history), [
      { role: "user", content: "leak!" },
      { role: "assistant", content: "Turn the valve." },
    ]);
    assert.equal(historyText(history), "Customer: leak!\nZukki: Turn the valve.\nBusiness: On my way");
  });
});

describe("createConversationStore", () => {
  it("reads the step from the conversation's messages", async () => {
    const { client } = fakeSupabase((call) => {
      if (call.path === "/rest/v1/conversations") return { body: { state: "with_zukki", category: "plumbing", urgency: "now" } };
      if (call.path === "/rest/v1/customer_locations") return { body: [] };
      return {
        body: [
          { sender: "zukki", kind: "text", payload: null },
          { sender: "zukki", kind: "interactive", payload: { variant: "safety" } },
          { sender: "customer", kind: "media", payload: null },
        ],
      };
    });
    const facts = await createConversationStore(client).facts(CHAT);
    assert.deepEqual(facts, { state: "with_zukki", category: "plumbing", urgency: "now", safety: "awaiting", locationAsked: false, hasLocation: false, hasTitle: false });
  });

  it("reads the 'closing won't help' message as a finished safety step, so the next message sends no valve card", () => {
    const message = shutOffWontHelp();
    const conversation = { state: "with_zukki", category: "plumbing", urgency: "now" } as Parameters<typeof readFacts>[0];

    const facts = readFacts(conversation, [{ sender: "zukki", kind: message.kind, payload: message.payload }] as Parameters<typeof readFacts>[1], false);

    assert.equal(facts.safety, "answered");
  });

  it("sees an answered safety step, the location request and the shared location", async () => {
    const { client } = fakeSupabase((call) => {
      if (call.path === "/rest/v1/conversations") return { body: { state: "matched", category: "plumbing", urgency: "now" } };
      if (call.path === "/rest/v1/customer_locations") return { body: [] };
      return {
        body: [
          { sender: "zukki", kind: "interactive", payload: { variant: "safety" } },
          { sender: "customer", kind: "button_reply", payload: { id: "safety_done", title: "Done, no cables" } },
          { sender: "zukki", kind: "location_request", payload: null },
          { sender: "customer", kind: "location", payload: { customer_location_id: MEDIA } },
        ],
      };
    });
    const facts = await createConversationStore(client).facts(CHAT);
    assert.equal(facts.safety, "answered");
    assert.equal(facts.locationAsked, true);
    assert.equal(facts.hasLocation, true);
    assert.equal(facts.state, "matched");
  });

  it("counts a saved location even without a location message", async () => {
    const { client } = fakeSupabase((call) => {
      if (call.path === "/rest/v1/conversations") return { body: { state: "matched", category: "plumbing", urgency: "now" } };
      if (call.path === "/rest/v1/customer_locations") return { body: [{ id: MEDIA }] };
      return { body: [] };
    });
    assert.equal((await createConversationStore(client).facts(CHAT)).hasLocation, true);
  });

  it("queues a Zukki message in the outbox", async () => {
    const { client, calls } = fakeSupabase(() => ({ body: [] }));
    await createConversationStore(client).queue(CHAT, { kind: "text", body: "Hi", payload: { notice: "x" } }, NORTHSIDE);
    assert.equal(calls[0]?.method, "POST");
    assert.equal(calls[0]?.path, "/rest/v1/messages");
    assert.deepEqual(calls[0]?.body, {
      conversation_id: CHAT,
      tenant_id: NORTHSIDE,
      sender: "zukki",
      kind: "text",
      body: "Hi",
      payload: { notice: "x" },
      delivery: "queued",
    });
  });

  it("saves the need without empty fields", async () => {
    const { client, calls } = fakeSupabase(() => ({ body: [] }));
    await createConversationStore(client).saveNeed(CHAT, { category: "food", urgency: "today", title: null, summary: "Dinner for 4" });
    assert.equal(calls[0]?.method, "PATCH");
    assert.deepEqual(calls[0]?.body, { category: "food", urgency: "today", summary: "Dinner for 4" });
    assert.equal(calls[0]?.query.get("id"), `eq.${CHAT}`);
  });

  it("returns history oldest first without the message being answered", async () => {
    const { client } = fakeSupabase(() => ({
      body: [
        { sender: "customer", kind: "text", body: "how much?", payload: null, wa_message_id: "wamid.NOW", media: null },
        { sender: "customer", kind: "button_reply", body: "Done, no cables", payload: { id: "safety_done", title: "Done, no cables" }, wa_message_id: "wamid.B", media: null },
        { sender: "zukki", kind: "interactive", body: "Turn this valve.", payload: { variant: "safety" }, wa_message_id: "wamid.Z", media: null },
        { sender: "customer", kind: "media", body: null, payload: null, wa_message_id: "wamid.V", media: { kind: "audio", transcript: "it's flooding" } },
      ],
    }));
    const history = await createConversationStore(client).history(CHAT, 12, "wamid.NOW");
    assert.deepEqual(history, [
      { from: "customer", text: '[sent a voice note: "it\'s flooding"]' },
      { from: "zukki", text: "Turn this valve." },
      { from: "customer", text: '[tapped "Done, no cables"]' },
    ]);
  });
});

describe("createMediaReader", () => {
  const HELPS = {
    problem: "Toilet overflowing onto the floor",
    customerMessage: "Your toilet is overflowing. Close the valve.",
    severity: "emergency",
    waterShutOff: "helps",
    valveObject: "angle valve",
    bestSeconds: 7,
  } as const;
  const video = { conversationId: CHAT, mediaId: MEDIA, mediaType: "video", caption: "help", findValve: true } as const;
  const notesOf = (parts: ContentPart[]) => parts.flatMap((part) => (part.type === "text" ? [part.text] : [])).join("\n");

  async function fakePipeline(over: Partial<PipelineDeps> = {}) {
    const dir = await mkdtemp(join(tmpdir(), "zukki-"));
    const file = join(dir, "in.mp4");
    await writeFile(file, "x");
    const calls: string[] = [];
    const frameSeconds: (number | undefined)[] = [];
    const concepts: (string | undefined)[] = [];
    const pipeline: PipelineDeps = {
      downloadMedia: async () => file,
      toWav: async (p) => `${p}.wav`,
      transcribe: async () => "water everywhere",
      triage: async () => HELPS,
      extractFrame: async (p, atSeconds) => {
        calls.push("frame");
        frameSeconds.push(atSeconds);
        return `${p}.jpg`;
      },
      toDataUrl: async () => "data:image/jpeg;base64,AAAA",
      markValve: async (_frame, _url, concept) => {
        calls.push("sam");
        concepts.push(concept);
        return { kind: "marked", markedFramePath: join(dir, "marked.jpg"), detection: { box: [1, 2, 3, 4], confidence: 0.9, label: "valve", width: 10, height: 10 } } as never;
      },
      publishImage: async () => "https://example.supabase.co/marked.jpg",
      runAgent: async () => ({ reply: "" }),
      ...over,
    };
    return { pipeline, dir, calls, frameSeconds, concepts };
  }

  it("transcribes a voice note and cleans up the download", async () => {
    const { pipeline, dir } = await fakePipeline();
    const reading = await createMediaReader(pipeline)({ conversationId: CHAT, mediaId: MEDIA, mediaType: "audio", caption: null, findValve: true });
    assert.equal(reading.transcript, "water everywhere");
    assert.deepEqual(reading.parts, [{ type: "text", text: "Customer voice note (transcribed): water everywhere" }]);
    assert.equal(existsSync(dir), false);
  });

  it("marks the valve on a video frame and publishes it", async () => {
    const published: (string | undefined)[][] = [];
    const { pipeline, calls } = await fakePipeline({
      publishImage: async (conversationId, _path, sourceMediaId) => {
        published.push([conversationId, sourceMediaId]);
        return "https://example.supabase.co/marked.jpg";
      },
    });
    const reading = await createMediaReader(pipeline)({ conversationId: CHAT, mediaId: MEDIA, mediaType: "video", caption: "help", findValve: true });
    assert.deepEqual(calls, ["frame", "sam"]);
    // Saved against the customer's video, so the owner's card shows it too.
    assert.deepEqual(published, [[CHAT, MEDIA]]);
    assert.equal(reading.markedFrameUrl, "https://example.supabase.co/marked.jpg");
    assert.equal(reading.valveAdvice, null);
    assert.equal(reading.parts[0]?.type, "text");
    assert.equal(reading.parts[1]?.type, "image_url");
  });

  it("marks the valve Spark named, on the frame at the second Spark chose", async () => {
    const { pipeline, frameSeconds, concepts } = await fakePipeline();

    const reading = await createMediaReader(pipeline)(video);

    assert.deepEqual(frameSeconds, [7]);
    assert.deepEqual(concepts, ["angle valve"]);
    assert.equal(reading.shutOffWontHelp, false);
    assert.match(notesOf(reading.parts), /Toilet overflowing onto the floor/);
  });

  it("gives Spark the whole video and the customer's words", async () => {
    const seen: unknown[][] = [];
    const { pipeline } = await fakePipeline({
      triage: async (...args) => {
        seen.push(args);
        return HELPS;
      },
    });

    await createMediaReader(pipeline)(video);

    assert.equal(String(seen[0]?.[0]).endsWith("in.mp4"), true);
    assert.deepEqual(seen[0]?.slice(1), ["video", "help"]);
  });

  it("says closing the water will not help, and asks SAM nothing when no valve is visible", async () => {
    const { pipeline, calls } = await fakePipeline({
      triage: async () => ({ ...HELPS, problem: "Rain leaking through the roof", waterShutOff: "wont_help", valveObject: null }),
    });

    const reading = await createMediaReader(pipeline)(video);

    assert.deepEqual(calls, ["frame"]);
    assert.equal(reading.shutOffWontHelp, true);
    assert.equal(reading.markedFrameUrl, null);
    assert.equal(reading.valveAdvice, null);
    assert.match(notesOf(reading.parts), /Do not tell the customer to close a valve/);
  });

  it("gives general advice without asking SAM when Spark sees no valve", async () => {
    const { pipeline, calls } = await fakePipeline({ triage: async () => ({ ...HELPS, valveObject: null }) });

    const reading = await createMediaReader(pipeline)(video);

    assert.deepEqual(calls, ["frame"]);
    assert.equal(reading.valveAdvice, GENERIC_VALVE_ADVICE);
    assert.equal(reading.shutOffWontHelp, false);
  });

  it("gives the customer Spark's message and says when the need is serious", async () => {
    const { pipeline } = await fakePipeline();

    const reading = await createMediaReader(pipeline)(video);

    assert.equal(reading.analysis, "Your toilet is overflowing. Close the valve.");
    assert.equal(reading.serious, true);
  });

  it("says nothing extra when Spark could not read the media", async () => {
    const { pipeline } = await fakePipeline({
      triage: async () => {
        throw new Error("Spark is down");
      },
    });

    const reading = await createMediaReader(pipeline, { warn: () => {} })(video);

    assert.equal(reading.analysis, null);
    assert.equal(reading.serious, false);
  });

  it("marks a visible valve even when closing it will not stop this leak", async () => {
    const { pipeline, calls } = await fakePipeline({
      triage: async () => ({ ...HELPS, problem: "Drain leaking into a bucket", severity: "routine", waterShutOff: "wont_help" }),
    });

    const reading = await createMediaReader(pipeline)(video);

    assert.deepEqual(calls, ["frame", "sam"]);
    assert.equal(reading.markedFrameUrl, "https://example.supabase.co/marked.jpg");
    assert.equal(reading.shutOffWontHelp, true);
    assert.equal(reading.serious, false);
  });

  it("marks nothing when nothing is wrong", async () => {
    const { pipeline, calls } = await fakePipeline({
      triage: async () => ({ ...HELPS, problem: "No leak", severity: "none", waterShutOff: "wont_help" }),
    });

    const reading = await createMediaReader(pipeline)(video);

    assert.deepEqual(calls, ["frame"]);
    assert.equal(reading.markedFrameUrl, null);
  });

  it("gives the general advice and logs it when SAM fails", async () => {
    const warnings: string[] = [];
    const { pipeline } = await fakePipeline({
      markValve: async () => {
        throw new Error("SAM is down");
      },
    });

    const reading = await createMediaReader(pipeline, { warn: (message) => warnings.push(message) })(video);

    assert.equal(reading.valveAdvice, GENERIC_VALVE_ADVICE);
    assert.match(warnings[0] ?? "", /SAM is down/);
  });

  it("keeps the valve search when Spark is unsure", async () => {
    const { pipeline, calls } = await fakePipeline({ triage: async () => ({ ...HELPS, waterShutOff: "unclear" }) });

    const reading = await createMediaReader(pipeline)(video);

    assert.deepEqual(calls, ["frame", "sam"]);
    assert.equal(reading.shutOffWontHelp, false);
  });

  it("falls back to the first frames and SAM's own word when Spark fails, and logs it", async () => {
    const warnings: string[] = [];
    const { pipeline, calls, frameSeconds, concepts } = await fakePipeline({
      triage: async () => {
        throw new Error("Spark is down");
      },
    });

    const reading = await createMediaReader(pipeline, { warn: (message) => warnings.push(message) })(video);

    assert.deepEqual(calls, ["frame", "sam"]);
    assert.deepEqual(frameSeconds, [undefined]);
    assert.deepEqual(concepts, [undefined]);
    assert.equal(reading.markedFrameUrl, "https://example.supabase.co/marked.jpg");
    assert.match(warnings[0] ?? "", /Spark is down/);
  });

  it("asks Spark nothing about a voice note", async () => {
    let triaged = 0;
    const { pipeline } = await fakePipeline({
      triage: async () => {
        triaged += 1;
        return HELPS;
      },
    });

    await createMediaReader(pipeline)({ ...video, mediaType: "audio" });

    assert.equal(triaged, 0);
  });

  it("reads a photo for any category and gives its message, without looking for a valve", async () => {
    const { pipeline, calls } = await fakePipeline({
      triage: async () => ({
        ...HELPS,
        problem: "Dented rear bumper",
        customerMessage: "I can see a dent in your rear bumper. It looks safe to drive slowly.",
        severity: "routine",
        waterShutOff: "wont_help",
        valveObject: null,
      }),
    });

    const reading = await createMediaReader(pipeline)({ ...video, mediaType: "image", findValve: false });

    assert.deepEqual(calls, []);
    assert.equal(reading.analysis, "I can see a dent in your rear bumper. It looks safe to drive slowly.");
    assert.equal(reading.valveAdvice, null);
    assert.equal(reading.markedFrameUrl, null);
  });

  it("does not look for a valve outside water problems even if Spark names one", async () => {
    const { pipeline, calls } = await fakePipeline();

    const reading = await createMediaReader(pipeline)({ ...video, findValve: false });

    assert.deepEqual(calls, ["frame"]);
    assert.equal(reading.markedFrameUrl, null);
    assert.equal(reading.shutOffWontHelp, false);
    assert.doesNotMatch(notesOf(reading.parts), /shut-off valve/i);
  });

  it("does not tell a business outside plumbing that closing a valve will not help", async () => {
    const { pipeline } = await fakePipeline({ triage: async () => ({ ...HELPS, waterShutOff: "wont_help", valveObject: null }) });

    const reading = await createMediaReader(pipeline)({ ...video, findValve: false });

    assert.equal(reading.shutOffWontHelp, false);
    assert.doesNotMatch(notesOf(reading.parts), /water valve/);
  });

  it("skips SAM when no valve is needed and passes on the advice when none was found", async () => {
    const skip = await fakePipeline();
    await createMediaReader(skip.pipeline)({ conversationId: CHAT, mediaId: MEDIA, mediaType: "image", caption: null, findValve: false });
    assert.deepEqual(skip.calls, []);

    const unsure = await fakePipeline({ markValve: async () => ({ kind: "fallback", advice: "Look under the tank." }) });
    const reading = await createMediaReader(unsure.pipeline)({ conversationId: CHAT, mediaId: MEDIA, mediaType: "image", caption: null, findValve: true });
    assert.equal(reading.markedFrameUrl, null);
    assert.equal(reading.valveAdvice, "Look under the tank.");
  });
});

describe("createSerializer", () => {
  it("runs one conversation's tasks in order and keeps going after a failure", async () => {
    const order: string[] = [];
    const errors: string[] = [];
    const run = createSerializer({ ...quiet, error: (m: string) => errors.push(m) });
    const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
    run("a", async () => {
      await wait(20);
      order.push("a1");
    });
    run("a", async () => {
      throw new Error("boom");
    });
    run("b", async () => {
      order.push("b1");
    });
    await run("a", async () => {
      order.push("a3");
    });
    assert.deepEqual(order, ["b1", "a1", "a3"]);
    assert.match(errors.join("\n"), /boom/);
  });
});
