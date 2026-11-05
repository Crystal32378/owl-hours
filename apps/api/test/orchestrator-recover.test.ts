// Restart recovery: customer messages stored but never handled by Zukki
// (the process restarted mid-turn) are rebuilt into turns and replayed once.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { findUnanswered, recoverUnanswered, RECOVER_AFTER_MS, RECOVER_WITHIN_MS } from "../src/orchestrator/recover.ts";
import type { Turn, TurnContext } from "../src/orchestrator/types.ts";
import { fakeSupabase, type FakeCall } from "./helpers/fake-supabase.ts";

const CHAT = "40000000-0000-4000-8000-000000000001";
const OTHER = "40000000-0000-4000-8000-000000000002";
const MEDIA = "60000000-0000-4000-8000-000000000001";
const NORTHSIDE = "10000000-0000-4000-8000-000000000001";
const NOW = new Date("2026-10-29T10:00:00Z");
const quiet = { info: () => {}, warn: () => {}, error: () => {} };

const msg = (over: Record<string, unknown>) => ({
  id: "70000000-0000-4000-8000-000000000001",
  conversation_id: CHAT,
  wa_message_id: "wamid.a",
  kind: "text",
  body: "water everywhere",
  payload: null,
  media_id: null,
  created_at: "2026-10-29T09:50:00Z",
  media: null,
  ...over,
});

function db(rows: Record<string, unknown>[], earlier: Record<string, number> = {}, open: Record<string, string> = {}) {
  return fakeSupabase((call: FakeCall) => {
    if (call.path === "/rest/v1/messages" && call.query.get("zukki_handled_at") === "is.null") return { body: rows };
    if (call.path === "/rest/v1/messages") {
      const chat = call.query.get("conversation_id")?.replace("eq.", "") ?? "";
      return { body: Array.from({ length: Math.min(earlier[chat] ?? 0, 1) }, () => ({ id: "x" })) };
    }
    const listed = (key: string) => (call.query.get(key) ?? "").replace(/^in\.\(|\)$/g, "").split(",").map((v) => v.replace(/"/g, ""));
    if (call.path === "/rest/v1/conversations") {
      return { body: listed("id").map((id) => ({ id, active_handoff_id: open[id] ? `h-${id}` : null })) };
    }
    if (call.path === "/rest/v1/handoffs") {
      assert.equal(call.query.get("status"), "eq.accepted");
      return {
        body: Object.entries(open)
          .filter(([chat]) => listed("id").includes(`h-${chat}`))
          .map(([chat, tenant]) => ({ id: `h-${chat}`, tenant_id: tenant })),
      };
    }
    return { status: 500, body: {} };
  });
}

describe("findUnanswered", () => {
  it("looks only at customer messages Zukki never handled, old enough and recent enough", async () => {
    const { client, calls } = db([]);
    await findUnanswered(client, NOW);
    const query = calls[0]!.query;
    assert.equal(query.get("sender"), "eq.customer");
    assert.equal(query.get("zukki_handled_at"), "is.null");
    assert.deepEqual(query.getAll("created_at"), [
      `gte.${new Date(NOW.getTime() - RECOVER_WITHIN_MS).toISOString()}`,
      `lte.${new Date(NOW.getTime() - RECOVER_AFTER_MS).toISOString()}`,
    ]);
  });

  it("rebuilds each kind of message into the turn Zukki would have seen", async () => {
    const { client } = db(
      [
        msg({}),
        msg({ wa_message_id: "wamid.b", kind: "button_reply", body: "Done, no cables", payload: { id: "safety_done", title: "Done, no cables" } }),
        msg({ wa_message_id: "wamid.c", kind: "location", body: null, payload: { customer_location_id: "l1" } }),
        msg({ wa_message_id: "wamid.d", kind: "media", body: "help", media_id: MEDIA, media: { kind: "video", size_bytes: 1200 } }),
        msg({ wa_message_id: "wamid.e", kind: "media", body: null, media_id: MEDIA, media: { kind: "audio", size_bytes: null } }),
        msg({ wa_message_id: "wamid.f", conversation_id: OTHER, body: "zukki" }),
      ],
      { [CHAT]: 1, [OTHER]: 0 },
      { [OTHER]: NORTHSIDE },
    );
    const found = await findUnanswered(client, NOW);
    assert.deepEqual(found.map((f) => f.turn), [
      { kind: "text", text: "water everywhere" },
      { kind: "button", id: "safety_done", title: "Done, no cables" },
      { kind: "location" },
      { kind: "media", mediaId: MEDIA, mediaType: "video", caption: "help" },
      // The file never finished downloading: ask the customer to send it again.
      { kind: "media_failed" },
      { kind: "text", text: "zukki" },
    ] satisfies Turn[]);
    assert.deepEqual(found[0]?.ctx, { conversationId: CHAT, waMessageId: "wamid.a", isNewConversation: false, businessId: null });
    assert.deepEqual(found[5]?.ctx, { conversationId: OTHER, waMessageId: "wamid.f", isNewConversation: true, businessId: NORTHSIDE });
  });
});

describe("recoverUnanswered", () => {
  it("queues each message once on its conversation, even across runs", async () => {
    const { client } = db([msg({}), msg({ wa_message_id: "wamid.b", conversation_id: OTHER })], { [CHAT]: 1, [OTHER]: 1 });
    const queued: Array<{ chat: string; ctx: TurnContext }> = [];
    const tasks: Array<() => Promise<void>> = [];
    const deps = {
      db: client,
      enqueue: (chat: string, task: () => Promise<void>) => void tasks.push(task),
      run: async (ctx: TurnContext, _turn: Turn) => void queued.push({ chat: ctx.conversationId, ctx }),
      log: quiet,
      now: () => NOW,
    };
    const recover = recoverUnanswered(deps);
    assert.equal(await recover(), 2);
    assert.equal(await recover(), 0, "still queued: not queued again");
    for (const task of tasks) await task();
    assert.deepEqual(queued.map((q) => q.ctx.waMessageId), ["wamid.a", "wamid.b"]);
  });
});
