// S6 (RED): a tap on payload 12 or 13 is recorded as the customer's message in
// the open business chat. The owner reads "Sounds good" for reply_ok and
// "I have a question" for both question buttons; the payload keeps the tap.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { WebhookEvent } from "@owl-hours/whatsapp";
import { handleEvents, type InboundDeps } from "../src/whatsapp/inbound.ts";
import { fakeSupabase } from "./helpers/fake-supabase.ts";

const ANA_CHAT = "40000000-0000-4000-8000-000000000001";
const NORTHSIDE = "10000000-0000-4000-8000-000000000001";
const QUOTE = "90000000-0000-4000-8000-000000000001";

const inboundRow = [{
  conversation_id: ANA_CHAT,
  message_id: "70000000-0000-4000-8000-000000000010",
  duplicate: false,
  is_new_conversation: false,
  open_tenant_id: NORTHSIDE,
}];

function setup() {
  const { client, calls } = fakeSupabase(() => ({ body: inboundRow }));
  const deps: InboundDeps = {
    db: client,
    client: {
      getMedia: async () => ({ url: "https://lookaside.fbsbx.com/x", mimeType: "video/mp4", sizeBytes: 3 }),
      download: async () => new Uint8Array([1, 2, 3]),
    },
    storeMedia: async () => {},
    enqueue: () => {},
    respond: async () => {},
    log: { info: () => {}, warn: () => {}, error: () => {} },
  };
  return { deps, calls };
}

const tap = (id: string, title: string): WebhookEvent => ({
  type: "message",
  waId: "15551234567",
  profileName: "Ana Lopez",
  waMessageId: "wamid.tap",
  receivedAt: "2026-10-28T05:04:00.000Z",
  content: { kind: "button_reply", id, title },
});

async function recordedTap(id: string, title: string) {
  const { deps, calls } = setup();
  await handleEvents(deps, [tap(id, title)]);
  const record = calls.find((call) => call.path === "/rest/v1/rpc/record_inbound_message");
  assert.ok(record, "the tap is recorded");
  return record.body as { p_kind: string; p_body: string; p_payload: { id: string; title: string } };
}

describe("handleEvents: reply and quote taps in the business chat (S6)", () => {
  it("records reply_ok as the customer's Sounds good", async () => {
    const record = await recordedTap("reply_ok", "Sounds good");
    assert.equal(record.p_kind, "button_reply");
    assert.equal(record.p_body, "Sounds good");
    assert.deepEqual(record.p_payload, { id: "reply_ok", title: "Sounds good" });
  });

  it("records reply_question as the customer's I have a question, keeping the tap in the payload", async () => {
    const record = await recordedTap("reply_question", "Ask a question");
    assert.equal(record.p_body, "I have a question");
    assert.deepEqual(record.p_payload, { id: "reply_question", title: "Ask a question" });
  });

  it("records quote_question as the customer's I have a question, keeping the tap in the payload", async () => {
    const record = await recordedTap(`quote_question:${QUOTE}`, "Ask a question");
    assert.equal(record.p_body, "I have a question");
    assert.deepEqual(record.p_payload, { id: `quote_question:${QUOTE}`, title: "Ask a question" });
  });

  it("still records any other tap with its button title", async () => {
    const record = await recordedTap("safety_done", "Done, no cables");
    assert.equal(record.p_body, "Done, no cables");
  });
});
