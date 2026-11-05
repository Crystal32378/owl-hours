// Outbox to Cloud API: payload 11/12 formats, author first names, and every
// claimed row reported back as sent or failed.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { OutgoingMessage } from "@owl-hours/whatsapp";
import { createApp } from "../src/index.ts";
import type { V1Deps } from "../src/routes/v1.ts";
import { WhatsAppApiError } from "@owl-hours/whatsapp";
import { drainOutbox, renderOutbound, type OutboxRow } from "../src/whatsapp/outbox.ts";
import { fakeSupabase, type FakeCall, type FakeReply } from "./helpers/fake-supabase.ts";

const ANA_CHAT = "40000000-0000-4000-8000-000000000001";
const NORTHSIDE = "10000000-0000-4000-8000-000000000001";
const MARIO = "20000000-0000-4000-8000-000000000001";
const MSG_A = "70000000-0000-4000-8000-000000000001";
const MSG_B = "70000000-0000-4000-8000-000000000002";
const quiet = { info: () => {}, warn: () => {}, error: () => {} };

const row = (over: Partial<OutboxRow> = {}): OutboxRow => ({
  id: MSG_A,
  conversationId: ANA_CHAT,
  waId: "15551234567",
  sender: "owner",
  kind: "text",
  body: "On my way, 20 minutes.",
  payload: null,
  businessName: "Northside Plumbing",
  businessShortName: "Northside",
  ...over,
});

describe("renderOutbound: Zukki's steps", () => {
  const zukki = (over: Partial<OutboxRow>) => row({ sender: "zukki", businessName: null, businessShortName: null, ...over });

  it("asks for the location with WhatsApp's button (payload 05)", () => {
    const message = renderOutbound(zukki({ kind: "location_request", body: "Share your location." }), null);
    assert.deepEqual(message?.interactive, {
      type: "location_request_message",
      body: { text: "Share your location." },
      action: { name: "send_location" },
    });
  });

  it("sends the category list with every row of payload 02", () => {
    const message = renderOutbound(zukki({ kind: "interactive", body: "What are you looking for?", payload: { variant: "category_list" } }), null);
    const interactive = message?.interactive as { type: string; action: { button: string; sections: Array<{ rows: Array<{ id: string }> }> }; footer: unknown };
    assert.equal(interactive.type, "list");
    assert.equal(interactive.action.button, "See options");
    assert.deepEqual(
      interactive.action.sections.flatMap((s) => s.rows.map((r) => r.id)),
      ["cat_plumbing", "cat_electrical", "cat_locksmith", "cat_food", "cat_beauty", "cat_auto", "cat_pets", "cat_other"],
    );
    assert.deepEqual(interactive.footer, { text: "Only businesses open now and near you" });
  });

  it("sends button cards with an image or text header and a footer (payloads 04, 07)", () => {
    const safety = renderOutbound(
      zukki({
        kind: "interactive",
        body: "Turn this valve clockwise.",
        payload: { variant: "safety", header_image_url: "https://example.supabase.co/m.jpg", buttons: [{ id: "safety_done", title: "Done, no cables" }] },
      }),
      null,
    );
    assert.deepEqual((safety?.interactive as Record<string, unknown>).header, { type: "image", image: { link: "https://example.supabase.co/m.jpg" } });

    const card = renderOutbound(
      zukki({
        kind: "interactive",
        body: "★ 4.9 (128)",
        payload: {
          variant: "suggest_business",
          header_text: "Northside Plumbing",
          footer: "Closest plumber taking night jobs right now",
          buttons: [{ id: `connect:${NORTHSIDE}`, title: "Connect me" }, { id: "another_option", title: "Show another option" }],
        },
      }),
      null,
    );
    const interactive = card?.interactive as Record<string, unknown>;
    assert.deepEqual(interactive.header, { type: "text", text: "Northside Plumbing" });
    assert.deepEqual(interactive.footer, { text: "Closest plumber taking night jobs right now" });
  });

  it("refuses a card whose buttons break WhatsApp's limits", () => {
    const tooLong = zukki({ kind: "interactive", body: "x", payload: { buttons: [{ id: "a", title: "This title is far too long" }] } });
    assert.equal(renderOutbound(tooLong, null), null);
    assert.equal(renderOutbound(zukki({ kind: "interactive", body: "x", payload: {} }), null), null);
  });
});

describe("renderOutbound", () => {
  it("signs an owner message as written (payload 11)", () => {
    assert.deepEqual(renderOutbound(row(), "Mario"), {
      to: "15551234567",
      type: "text",
      text: { preview_url: false, body: "*Northside Plumbing · Mario*\nOn my way, 20 minutes." },
    });
  });

  it("sends a polished reply with footer and buttons (payload 12)", () => {
    const message = renderOutbound(row({ kind: "interactive", payload: { variant: "polished_reply" } }), "Mario") as OutgoingMessage;
    const interactive = message.interactive as Record<string, unknown>;
    assert.deepEqual(interactive.footer, { text: "Written with Zukki, approved by Northside" });
    assert.deepEqual(interactive.body, { text: "*Northside Plumbing · Mario*\nOn my way, 20 minutes." });
    assert.deepEqual(
      (interactive.action as { buttons: Array<{ reply: { id: string } }> }).buttons.map((b) => b.reply.id),
      ["reply_ok", "reply_question"],
    );
  });

  it("falls back to text with the footer line when the polish is too long for buttons", () => {
    const long = "a".repeat(1100);
    const message = renderOutbound(row({ kind: "interactive", payload: { variant: "polished_reply" }, body: long }), "Mario");
    assert.equal(message?.type, "text");
    assert.match(String((message?.text as { body: string }).body), /_Written with Zukki, approved by Northside_$/);
  });

  it("sends Zukki text plainly and refuses kinds it cannot format", () => {
    assert.deepEqual(renderOutbound(row({ sender: "zukki", body: "Turn the valve." }), null)?.text, { preview_url: false, body: "Turn the valve." });
    assert.equal(renderOutbound(row({ kind: "location_request" }), "Mario"), null);
    assert.equal(renderOutbound(row({ body: null }), "Mario"), null);
  });
});

function db(respond: (call: FakeCall) => FakeReply | undefined) {
  return fakeSupabase((call) => {
    const answer = respond(call);
    if (answer) return answer;
    if (call.path.endsWith("/claim_outbox")) {
      return { body: [row(), row({ id: MSG_B, kind: "location_request" })] };
    }
    if (call.path === "/rest/v1/messages") {
      return { body: [{ id: MSG_A, tenant_id: NORTHSIDE, author_user_id: MARIO }, { id: MSG_B, tenant_id: NORTHSIDE, author_user_id: MARIO }] };
    }
    if (call.path === "/rest/v1/tenant_users") {
      return { body: [{ tenant_id: NORTHSIDE, user_id: MARIO, display_name: "Mario Rossi" }] };
    }
    return { body: { id: (call.body as { p_message_id: string }).p_message_id, delivery: "sent", wa_message_id: null } };
  });
}

describe("drainOutbox", () => {
  it("sends what it can format and reports every row", async () => {
    const { client, calls } = db(() => undefined);
    const sent: OutgoingMessage[] = [];
    const result = await drainOutbox({ db: client, client: { send: async (m) => (sent.push(m), "wamid.OUT1") }, log: quiet });
    assert.deepEqual(result, { sent: 1, failed: 1 });
    assert.equal((sent[0]?.text as { body: string }).body, "*Northside Plumbing · Mario*\nOn my way, 20 minutes.");
    const results = calls.filter((c) => c.path.endsWith("/record_outbound_result")).map((c) => c.body);
    assert.deepEqual(results, [
      { p_message_id: MSG_A, p_wa_message_id: "wamid.OUT1", p_retry: false },
      { p_message_id: MSG_B, p_wa_message_id: null, p_retry: false },
    ]);
  });

  it("marks a row failed when WhatsApp refuses it", async () => {
    const { client, calls } = db((call) => (call.path.endsWith("/claim_outbox") ? { body: [row()] } : undefined));
    const result = await drainOutbox({
      db: client,
      client: { send: async () => { throw new Error("WhatsApp API 400 (code 131047): Re-engagement message"); } },
      log: quiet,
    });
    assert.deepEqual(result, { sent: 0, failed: 1 });
    assert.deepEqual(calls.at(-1)?.body, { p_message_id: MSG_A, p_wa_message_id: null, p_retry: false });
  });

  it("asks for a retry when WhatsApp is busy, down or does not answer", async () => {
    const failures: unknown[] = [
      new WhatsAppApiError(429, 130429, "WhatsApp API 429: rate limit"),
      new WhatsAppApiError(503, null, "WhatsApp API 503: unavailable"),
      Object.assign(new Error("The operation was aborted due to timeout"), { name: "TimeoutError" }),
      new TypeError("fetch failed"),
    ];
    for (const failure of failures) {
      const { client, calls } = db((call) => (call.path.endsWith("/claim_outbox") ? { body: [row()] } : undefined));
      await drainOutbox({ db: client, client: { send: async () => { throw failure; } }, log: quiet });
      assert.deepEqual(calls.at(-1)?.body, { p_message_id: MSG_A, p_wa_message_id: null, p_retry: true }, String(failure));
    }
  });

  it("does nothing when the outbox is empty", async () => {
    const { client, calls } = db((call) => (call.path.endsWith("/claim_outbox") ? { body: [] } : undefined));
    assert.deepEqual(await drainOutbox({ db: client, client: { send: async () => "x" }, log: quiet }), { sent: 0, failed: 0 });
    assert.equal(calls.length, 1);
  });
});

describe("/v1/internal WhatsApp sending", () => {
  const SERVER_KEY = "server-key-0123456789-0123456789-0123";
  const setup = (extra: Partial<V1Deps>) => {
    const { client } = db((call) => (call.path.endsWith("/claim_outbox") ? { body: [] } : undefined));
    const { app } = createApp({ v1: { authenticate: async () => null, serviceDb: client, serverKey: SERVER_KEY, ...extra } });
    return (path: string, body: unknown) =>
      app.request(`/v1/internal${path}`, {
        method: "POST",
        body: JSON.stringify(body),
        headers: { "x-zukki-key": SERVER_KEY, "content-type": "application/json" },
      });
  };

  it("answers 503 until WhatsApp is configured", async () => {
    const call = setup({});
    const res = await call("/whatsapp/send", { to: "15551234567", text: "Test" });
    assert.equal(res.status, 503);
    assert.equal(((await res.json()) as { error: { code: string } }).error.code, "whatsapp_not_configured");
  });

  it("sends a test text and returns the wamid", async () => {
    const sent: OutgoingMessage[] = [];
    const call = setup({ whatsapp: { send: async (m) => (sent.push(m), "wamid.TEST") } });
    const res = await call("/whatsapp/send", { to: "15551234567", text: "Test from Zukki" });
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { success: true, data: { waMessageId: "wamid.TEST" } });
    assert.equal(sent[0]?.to, "15551234567");
    assert.equal((await call("/whatsapp/send", { to: "+1 555", text: "x" })).status, 400);
  });

  it("drains the outbox on request", async () => {
    const call = setup({ whatsapp: { send: async () => "wamid.X" } });
    const res = await call("/outbox/send", {});
    assert.deepEqual(await res.json(), { success: true, data: { sent: 0, failed: 0 } });
  });
});
