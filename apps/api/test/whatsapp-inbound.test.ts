// Webhook events to database calls: the right RPC per message type, quote
// approval from the button, and media stored before the download runs.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { WebhookEvent } from "@owl-hours/whatsapp";
import type { Turn, TurnContext } from "../src/orchestrator/types.ts";
import { handleEvents, type InboundDeps } from "../src/whatsapp/inbound.ts";
import { fakeSupabase, pgError, type FakeCall, type FakeReply } from "./helpers/fake-supabase.ts";

const ANA_CHAT = "40000000-0000-4000-8000-000000000001";
const MEDIA = "60000000-0000-4000-8000-000000000001";
const QUOTE = "90000000-0000-4000-8000-000000000001";

const inboundRow = (duplicate = false) => [{
  conversation_id: ANA_CHAT,
  message_id: duplicate ? null : "70000000-0000-4000-8000-000000000010",
  duplicate,
  is_new_conversation: false,
  open_tenant_id: null,
}];

function setup(respond: (call: FakeCall) => FakeReply, options: { downloadFails?: boolean } = {}) {
  const { client, calls } = fakeSupabase(respond);
  const tasks: Array<() => Promise<void>> = [];
  const queuedFor: string[] = [];
  const turns: Array<{ ctx: TurnContext; turn: Turn }> = [];
  const stored: Array<{ path: string; bytes: number; contentType: string }> = [];
  const logs: string[] = [];
  const deps: InboundDeps = {
    db: client,
    client: {
      getMedia: async () => ({ url: "https://lookaside.fbsbx.com/x", mimeType: "video/mp4", sizeBytes: 3 }),
      download: async () => {
        if (options.downloadFails) throw new Error("WhatsApp API 404");
        return new Uint8Array([1, 2, 3]);
      },
    },
    storeMedia: async (path, bytes, contentType) => {
      stored.push({ path, bytes: bytes.byteLength, contentType });
    },
    enqueue: (conversationId, task) => {
      queuedFor.push(conversationId);
      tasks.push(task);
    },
    respond: async (ctx, turn) => {
      turns.push({ ctx, turn });
    },
    log: { info: (m: string) => logs.push(m), warn: (m: string) => logs.push(m), error: (m: string) => logs.push(m) },
  };
  const runTasks = async () => {
    for (const task of tasks) await task();
  };
  return { deps, calls, tasks, queuedFor, turns, runTasks, stored, logs };
}

const message = (content: Extract<WebhookEvent, { type: "message" }>["content"], id = "wamid.1"): WebhookEvent => ({
  type: "message",
  waId: "15551234567",
  profileName: "Ana Lopez",
  waMessageId: id,
  receivedAt: "2026-10-28T05:04:00.000Z",
  content,
});

describe("handleEvents", () => {
  it("stores text with the shortened profile name", async () => {
    const { deps, calls } = setup(() => ({ body: inboundRow() }));
    await handleEvents(deps, [message({ kind: "text", text: "My toilet is leaking" })]);
    assert.equal(calls[0]?.path, "/rest/v1/rpc/record_inbound_message");
    assert.deepEqual(calls[0]?.body, {
      p_wa_id: "15551234567",
      p_wa_message_id: "wamid.1",
      p_kind: "text",
      p_body: "My toilet is leaking",
      p_payload: null,
      p_media_id: null,
      p_profile_name: "Ana L.",
      p_at: "2026-10-28T05:04:00.000Z",
    });
  });

  it("approves the quote from the Approve visit button, once", async () => {
    const { deps, calls } = setup((call) =>
      call.path.endsWith("approve_quote") ? { body: { id: QUOTE, job_id: ANA_CHAT, status: "approved" } } : { body: inboundRow() },
    );
    await handleEvents(deps, [message({ kind: "button_reply", id: `quote_approve:${QUOTE}`, title: "Approve visit" })]);
    assert.deepEqual(calls.map((c) => c.path), ["/rest/v1/rpc/record_inbound_message", "/rest/v1/rpc/approve_quote"]);
    assert.deepEqual(calls[0]?.body && (calls[0].body as Record<string, unknown>).p_payload, { id: `quote_approve:${QUOTE}`, title: "Approve visit" });
    assert.deepEqual(calls[1]?.body, { p_quote_id: QUOTE });

    const retry = setup(() => ({ body: inboundRow(true) }));
    await handleEvents(retry.deps, [message({ kind: "button_reply", id: `quote_approve:${QUOTE}`, title: "Approve visit" })]);
    assert.equal(retry.calls.length, 1);
  });

  it("logs a refused approval instead of failing the webhook", async () => {
    const { deps, logs } = setup((call) =>
      call.path.endsWith("approve_quote") ? pgError("22023", "quote is superseded") : { body: inboundRow() },
    );
    await handleEvents(deps, [message({ kind: "button_reply", id: `quote_approve:${QUOTE}`, title: "Approve visit" })]);
    assert.match(logs.join("\n"), /not applied/);
  });

  it("saves a shared location on the resolved conversation", async () => {
    const { deps, calls } = setup((call) =>
      call.path.endsWith("resolve_inbound_conversation")
        ? { body: [{ conversation_id: ANA_CHAT, customer_id: ANA_CHAT, is_new: false, open_tenant_id: null }] }
        : { body: [{ message_id: ANA_CHAT, customer_location_id: ANA_CHAT, duplicate: false }] },
    );
    await handleEvents(deps, [message({ kind: "location", latitude: 41.88, longitude: -87.63, address: null }, "wamid.loc")]);
    assert.equal(calls[1]?.path, "/rest/v1/rpc/save_customer_location");
    assert.deepEqual(calls[1]?.body, {
      p_conversation_id: ANA_CHAT,
      p_wa_message_id: "wamid.loc",
      p_latitude: 41.88,
      p_longitude: -87.63,
      p_address: null,
      p_at: "2026-10-28T05:04:00.000Z",
    });
  });

  it("records a video, then downloads and stores it in the background", async () => {
    const { deps, calls, tasks, stored } = setup((call) => {
      if (call.path === "/rest/v1/messages") return { body: [] };
      if (call.path.endsWith("resolve_inbound_conversation")) {
        return { body: [{ conversation_id: ANA_CHAT, customer_id: ANA_CHAT, is_new: true, open_tenant_id: null }] };
      }
      if (call.path === "/rest/v1/media") return { body: call.method === "POST" ? { id: MEDIA } : [] };
      return { body: inboundRow() };
    });
    await handleEvents(deps, [message({ kind: "media", mediaType: "video", waMediaId: "WA-MEDIA", mimeType: "video/mp4", caption: "here" }, "wamid.vid")]);
    const insert = calls.find((c) => c.path === "/rest/v1/media" && c.method === "POST");
    const row = insert?.body as Record<string, string>;
    assert.equal(row.conversation_id, ANA_CHAT);
    assert.equal(row.kind, "video");
    assert.equal(row.wa_media_id, "WA-MEDIA");
    assert.match(row.storage_path ?? "", new RegExp(`^conversations/${ANA_CHAT}/[0-9a-f-]{36}\\.mp4$`));
    const record = calls.find((c) => c.path.endsWith("record_inbound_message"))?.body as Record<string, unknown>;
    assert.equal(record.p_kind, "media");
    assert.equal(record.p_media_id, MEDIA);
    assert.equal(record.p_body, "here");

    assert.equal(stored.length, 0);
    assert.equal(tasks.length, 1);
    await tasks[0]!();
    assert.deepEqual(stored, [{ path: row.storage_path, bytes: 3, contentType: "video/mp4" }]);
    const update = calls.find((c) => c.path === "/rest/v1/media" && c.method === "PATCH");
    assert.deepEqual(update?.body, { size_bytes: 3 });
  });

  it("skips media it already has and types the bucket refuses", async () => {
    const known = setup((call) => (call.path === "/rest/v1/messages" ? { body: [{ id: "m1" }] } : { body: inboundRow() }));
    await handleEvents(known.deps, [message({ kind: "media", mediaType: "image", waMediaId: "W", mimeType: "image/jpeg", caption: null })]);
    assert.deepEqual(known.calls.map((c) => c.path), ["/rest/v1/messages"]);
    assert.equal(known.tasks.length, 0);

    const odd = setup(() => ({ body: inboundRow() }));
    await handleEvents(odd.deps, [message({ kind: "media", mediaType: "audio", waMediaId: "W", mimeType: "audio/amr", caption: null })]);
    assert.equal(odd.calls.length, 0);
    assert.match(odd.logs.join("\n"), /audio\/amr is not accepted/);
  });

  it("records delivered, read and failed receipts but not sent", async () => {
    const { deps, calls } = setup(() => ({ body: true }));
    await handleEvents(deps, [
      { type: "status", waMessageId: "wamid.OUT", status: "sent", recipientWaId: null },
      { type: "status", waMessageId: "wamid.OUT", status: "read", recipientWaId: null },
    ]);
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0]?.body, { p_wa_message_id: "wamid.OUT", p_status: "read" });
  });

  it("marks a message handled once Zukki's turn is done, so restart recovery skips it", async () => {
    const { deps, calls, runTasks } = setup(() => ({ body: inboundRow() }));
    await handleEvents(deps, [message({ kind: "text", text: "My toilet is leaking" })]);
    assert.equal(calls.some((c) => c.method === "PATCH"), false, "not before the turn runs");
    await runTasks();
    const mark = calls.find((c) => c.method === "PATCH" && c.path === "/rest/v1/messages");
    assert.ok(mark, "handled mark written");
    assert.equal(mark.query.get("wa_message_id"), "eq.wamid.1");
    assert.equal(mark.query.get("sender"), "eq.customer");
    assert.match(String((mark.body as { zukki_handled_at: string }).zukki_handled_at), /^\d{4}-\d\d-\d\dT/);
  });

  it("leaves a message unmarked when the turn fails, so recovery retries it", async () => {
    const { deps, calls, runTasks } = setup(() => ({ body: inboundRow() }));
    deps.respond = async () => {
      throw new Error("database down");
    };
    await handleEvents(deps, [message({ kind: "text", text: "hi" })]);
    await assert.rejects(runTasks(), /database down/);
    assert.equal(calls.some((c) => c.method === "PATCH"), false);
  });

  it("hands each new message to Zukki on the conversation's queue, once", async () => {
    const { deps, queuedFor, turns, runTasks } = setup(() => ({ body: inboundRow() }));
    await handleEvents(deps, [message({ kind: "text", text: "My toilet is leaking" })]);
    assert.deepEqual(queuedFor, [ANA_CHAT]);
    assert.deepEqual(turns, []);
    await runTasks();
    assert.deepEqual(turns, [
      {
        ctx: { conversationId: ANA_CHAT, waMessageId: "wamid.1", isNewConversation: false, businessId: null },
        turn: { kind: "text", text: "My toilet is leaking" },
      },
    ]);

    const retry = setup(() => ({ body: inboundRow(true) }));
    await handleEvents(retry.deps, [message({ kind: "text", text: "My toilet is leaking" })]);
    assert.equal(retry.tasks.length, 0);
  });

  it("passes button taps and locations on", async () => {
    const { deps, turns, runTasks } = setup((call) => {
      if (call.path.endsWith("resolve_inbound_conversation")) {
        return { body: [{ conversation_id: ANA_CHAT, customer_id: ANA_CHAT, is_new: false, open_tenant_id: null }] };
      }
      if (call.path.endsWith("save_customer_location")) {
        return { body: [{ message_id: ANA_CHAT, customer_location_id: ANA_CHAT, duplicate: false }] };
      }
      return { body: inboundRow() };
    });
    await handleEvents(deps, [
      message({ kind: "button_reply", id: "safety_done", title: "Done, no cables" }, "wamid.btn"),
      message({ kind: "location", latitude: 41.88, longitude: -87.63, address: null }, "wamid.loc"),
    ]);
    await runTasks();
    assert.deepEqual(turns.map((t) => t.turn), [{ kind: "button", id: "safety_done", title: "Done, no cables" }, { kind: "location" }]);
  });

  it("hands media to Zukki after it is stored, or says the download failed", async () => {
    const reply = (call: FakeCall): FakeReply => {
      if (call.path === "/rest/v1/messages") return { body: [] };
      if (call.path.endsWith("resolve_inbound_conversation")) {
        return { body: [{ conversation_id: ANA_CHAT, customer_id: ANA_CHAT, is_new: true, open_tenant_id: null }] };
      }
      if (call.path === "/rest/v1/media") return { body: call.method === "POST" ? { id: MEDIA } : [] };
      // As in the database: the conversation was made by the resolve call
      // just before, so recording the message no longer sees it as new.
      return { body: inboundRow() };
    };
    const video = message({ kind: "media", mediaType: "video", waMediaId: "WA-MEDIA", mimeType: "video/mp4", caption: null }, "wamid.vid");

    const ok = setup(reply);
    await handleEvents(ok.deps, [video]);
    await ok.runTasks();
    assert.equal(ok.stored.length, 1);
    assert.deepEqual(ok.turns[0]?.turn, { kind: "media", mediaId: MEDIA, mediaType: "video", caption: null });
    assert.equal(ok.turns[0]?.ctx.isNewConversation, true);

    const failed = setup(reply, { downloadFails: true });
    await handleEvents(failed.deps, [video]);
    await failed.runTasks();
    assert.deepEqual(failed.turns[0]?.turn, { kind: "media_failed" });
    assert.match(failed.logs.join("\n"), /download of media/);
  });

  it("lets a database error through so the webhook answers 500", async () => {
    const { deps } = setup(() => pgError("XX000", "boom", 500));
    await assert.rejects(handleEvents(deps, [message({ kind: "text", text: "hi" })]));
  });
});
