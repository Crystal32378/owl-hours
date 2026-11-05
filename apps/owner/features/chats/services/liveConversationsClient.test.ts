// The device zone is fixed so the mapped local timestamps are exact (Bogotá: UTC-5, no daylight saving).
process.env.TZ = "America/Bogota";

// Spec: odd/tasks/live-owner-core.md, T3, S4. The live client reads and writes /v1/owner through the shared
// owner API; a fake fetch answers each "METHOD /path" and records every call so URL, method and body are asserted.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createOwnerApi } from "../../../shared/infra/ownerApi.ts";
import { createConversationsService } from "./conversationsService.ts";
import { createLiveConversationsClient } from "./liveConversationsClient.ts";

type Call = { method: string; path: string; body: unknown };
type Routes = Record<string, { status?: number; data?: unknown; error?: { code: string; message: string } }>;

const SENT_AT = "2026-10-28T00:08:00-05:00";

const anaRow = {
  id: "c1",
  offerId: "h1",
  businessId: "t1",
  title: "Leaking toilet",
  customerName: "Ana L.",
  chatOpen: true,
  lastMessageAt: "2026-10-28T05:07:00+00:00",
  job: { id: "j1", state: "customer_approved", arrivalWindow: "12:55–1:25 AM" },
  lastMessage: { id: "m5", from: "customer", kind: "text", text: "Perfect, thank you!", sentAt: "2026-10-28T05:07:00+00:00" },
  unread: 0,
};

const carlosRow = {
  ...anaRow,
  id: "c2",
  offerId: "h2",
  title: "Kitchen sink",
  customerName: "Carlos M.",
  job: { id: "j2", state: "proposed", arrivalWindow: null },
  lastMessage: { id: "m9", from: "customer", kind: "text", text: "Can you come Thursday instead?", sentAt: "2026-10-28T02:48:00+00:00" },
  unread: 2,
};

function liveService(routes: Routes) {
  const calls: Call[] = [];
  const fetch = (async (url: string, init: RequestInit) => {
    const path = url.replace("https://api.example.com/v1/owner", "");
    const method = init.method ?? "GET";
    calls.push({ method, path, body: init.body === undefined ? undefined : JSON.parse(String(init.body)) });
    const route = routes[`${method} ${path}`];
    if (!route) return Response.json({ success: false, error: { code: "not_found", message: path } }, { status: 404 });
    const body = route.error ? { success: false, error: route.error } : { success: true, data: route.data };
    return Response.json(body, { status: route.status ?? 200 });
  }) as unknown as typeof globalThis.fetch;
  const api = createOwnerApi({ apiUrl: "https://api.example.com", getAccessToken: async () => "tok", fetch });
  const service = createConversationsService(createLiveConversationsClient(api), { now: () => SENT_AT, newMessageId: () => "m_new" });
  return { service, calls };
}

describe("live conversations: the list", () => {
  it("reads GET /conversations and maps each row to a conversation with its job status line", async () => {
    const { service, calls } = liveService({ "GET /conversations": { data: [anaRow, carlosRow] } });

    const conversations = await service.getConversations();

    assert.deepEqual(calls, [{ method: "GET", path: "/conversations", body: undefined }]);
    assert.deepEqual(conversations, [
      {
        id: "c1",
        offerId: "h1",
        customerName: "Ana L.",
        jobTitle: "Leaking toilet",
        statusLine: "visit 12:55–1:25 AM",
        lastMessage: { id: "m5", from: "customer", text: "Perfect, thank you!", sentAt: "2026-10-28T00:07:00-05:00" },
        unread: 0,
        jobId: "j1",
        jobTakesQuote: false,
      },
      {
        id: "c2",
        offerId: "h2",
        customerName: "Carlos M.",
        jobTitle: "Kitchen sink",
        statusLine: "waiting for you",
        lastMessage: { id: "m9", from: "customer", text: "Can you come Thursday instead?", sentAt: "2026-10-27T21:48:00-05:00" },
        unread: 2,
        jobId: "j2",
        jobTakesQuote: true,
      },
    ]);
  });

  it("writes 'quote sent' once the owner confirmed a quote and 'done' when the job is done", async () => {
    const quoted = { ...anaRow, id: "c3", job: { id: "j3", state: "owner_confirmed", arrivalWindow: "9:00–9:30 PM" } };
    const done = { ...anaRow, id: "c4", job: { id: "j4", state: "done", arrivalWindow: "9:00–9:30 AM" } };
    const { service } = liveService({ "GET /conversations": { data: [quoted, done] } });

    const lines = (await service.getConversations()).map((conversation) => conversation.statusLine);

    assert.deepEqual(lines, ["quote sent", "done"]);
  });

  it("writes 'visit' without a window, and nothing for a state it does not know", async () => {
    const approved = { ...anaRow, id: "c5", job: { id: "j5", state: "en_route", arrivalWindow: null } };
    const unknown = { ...anaRow, id: "c6", job: { id: "j6", state: "paused", arrivalWindow: null } };
    const { service } = liveService({ "GET /conversations": { data: [approved, unknown] } });

    const lines = (await service.getConversations()).map((conversation) => conversation.statusLine);

    assert.deepEqual(lines, ["visit", ""]);
  });

  it("finds one conversation by id in the list, or null when the owner cannot see it", async () => {
    const { service } = liveService({ "GET /conversations": { data: [anaRow, carlosRow] } });

    assert.equal((await service.getConversation("c2"))?.customerName, "Carlos M.");
    assert.equal(await service.getConversation("nope"), null);
  });
});

describe("live conversations: the thread", () => {
  it("leaves out a shared location, which has no text to show", async () => {
    const { service } = liveService({
      "GET /conversations": { data: [anaRow] },
      "GET /conversations/c1/messages": {
        data: [
          { id: "m1", from: "customer", kind: "location", text: null, payload: null, sentAt: "2026-10-28T05:05:00+00:00", status: "received", delivery: null, media: null },
          { id: "m2", from: "zukki", kind: "text", text: "Thanks.", payload: null, sentAt: "2026-10-28T05:06:00+00:00", status: "sent", delivery: null, media: null },
        ],
      },
    });

    assert.deepEqual((await service.getMessages("c1"))?.map((message) => message.id), ["m2"]);
  });

  it("reads GET /conversations/:id/messages and keeps the owner's delivery only on owner messages", async () => {
    const { service, calls } = liveService({
      "GET /conversations": { data: [anaRow] },
      "GET /conversations/c1/messages": {
        data: [
          { id: "m1", from: "zukki", kind: "text", text: "Leaking toilet", payload: null, sentAt: "2026-10-28T05:05:00+00:00", status: "sent", delivery: null, media: null },
          { id: "m2", from: "customer", kind: "media", text: null, payload: null, sentAt: "2026-10-28T05:06:00+00:00", status: "received", delivery: null, media: null },
          { id: "m3", from: "owner", kind: "interactive", text: "On my way", payload: null, sentAt: "2026-10-28T05:07:00+00:00", status: "queued", delivery: "polished", media: null },
        ],
      },
    });

    const messages = await service.getMessages("c1");

    assert.deepEqual(calls.at(-1), { method: "GET", path: "/conversations/c1/messages", body: undefined });
    assert.deepEqual(messages, [
      { id: "m1", from: "zukki", text: "Leaking toilet", sentAt: "2026-10-28T00:05:00-05:00" },
      { id: "m2", from: "customer", text: "", sentAt: "2026-10-28T00:06:00-05:00" },
      { id: "m3", from: "owner", text: "On my way", sentAt: "2026-10-28T00:07:00-05:00", delivery: "polished" },
    ]);
  });

  it("sends a message as written with POST /conversations/:id/messages {text}", async () => {
    const { service, calls } = liveService({
      "GET /conversations": { data: [anaRow] },
      "POST /conversations/c1/messages": { status: 201, data: { id: "s1", sentAt: SENT_AT, status: "queued", delivery: "as_written" } },
    });

    const result = await service.sendMessage("c1", "On my way", { polish: false });

    assert.deepEqual(calls.at(-1), { method: "POST", path: "/conversations/c1/messages", body: { text: "On my way" } });
    assert.deepEqual(result, { sent: { id: "m_new", from: "owner", text: "On my way", sentAt: SENT_AT, delivery: "as_written" } });
  });

  it("rejects the send when the chat is closed (422 chat_closed)", async () => {
    const { service } = liveService({
      "GET /conversations": { data: [anaRow] },
      "POST /conversations/c1/messages": { status: 422, error: { code: "chat_closed", message: "This chat is not open to your business." } },
    });

    await assert.rejects(service.sendMessage("c1", "Hi", { polish: false }), { code: "chat_closed" });
  });
});

describe("live conversations: polish with Zukki", () => {
  const draftRoutes: Routes = {
    "GET /conversations": { data: [anaRow] },
    "POST /conversations/c1/drafts": { status: 201, data: { draftId: "d1", original: "on my way", polished: "I'm on my way.", language: "English" } },
    "POST /drafts/d1/send": { status: 201, data: { id: "s1", sentAt: SENT_AT, status: "queued", delivery: "polished" } },
  };

  it("asks for Zukki's version with POST /conversations/:id/drafts {text} and answers the preview", async () => {
    const { service, calls } = liveService(draftRoutes);

    const preview = await service.sendMessage("c1", "on my way", { polish: true });

    assert.deepEqual(calls.at(-1), { method: "POST", path: "/conversations/c1/drafts", body: { text: "on my way" } });
    assert.deepEqual(preview, { original: "on my way", polished: "I'm on my way.", language: "English" });
  });

  it("sends Zukki's version of that draft with POST /drafts/:id/send {usePolished: true}", async () => {
    const { service, calls } = liveService(draftRoutes);
    const preview = { original: "on my way", polished: "I'm on my way.", language: "English" };
    await service.sendMessage("c1", "on my way", { polish: true });

    const message = await service.sendPolishChoice("c1", preview, "zukki");

    assert.deepEqual(calls.at(-1), { method: "POST", path: "/drafts/d1/send", body: { usePolished: true } });
    assert.equal(message?.delivery, "polished");
  });

  it("sends the owner's own words of that draft with POST /drafts/:id/send {usePolished: false}", async () => {
    const { service, calls } = liveService(draftRoutes);
    const preview = { original: "on my way", polished: "I'm on my way.", language: "English" };
    await service.sendMessage("c1", "on my way", { polish: true });

    const message = await service.sendPolishChoice("c1", preview, "mine");

    assert.deepEqual(calls.at(-1), { method: "POST", path: "/drafts/d1/send", body: { usePolished: false } });
    assert.equal(message?.text, "on my way");
  });

  it("sends a plain message through POST /conversations/:id/messages after an abandoned polish preview", async () => {
    const { service, calls } = liveService({ ...draftRoutes, "POST /conversations/c1/messages": { status: 201, data: { id: "s2", sentAt: SENT_AT } } });
    await service.sendMessage("c1", "on my way", { polish: true });

    await service.sendMessage("c1", "on my way", { polish: false });

    assert.deepEqual(calls.at(-1), { method: "POST", path: "/conversations/c1/messages", body: { text: "on my way" } });
  });

  it("fails the polish when Zukki has no version (polished null)", async () => {
    const { service } = liveService({
      ...draftRoutes,
      "POST /conversations/c1/drafts": { status: 201, data: { draftId: "d1", original: "on my way", polished: null, language: null } },
    });

    await assert.rejects(service.sendMessage("c1", "on my way", { polish: true }));
  });
});

describe("live conversations: quote suggestion and business name", () => {
  it("suggests the accepted offer's quote for the conversation's job", async () => {
    const { service, calls } = liveService({
      "GET /conversations": { data: [anaRow] },
      "GET /offers?status=accepted": { data: [{ id: "h9", suggestedQuote: { min: 1, max: 2 } }, { id: "h1", suggestedQuote: { min: 130, max: 160 } }] },
    });

    const suggestion = await service.getQuoteSuggestion("c1");

    assert.deepEqual(calls.at(-1), { method: "GET", path: "/offers?status=accepted", body: undefined });
    assert.deepEqual(suggestion, { jobId: "j1", suggestedQuote: { min: 130, max: 160 } });
  });

  it("suggests nothing when the conversation has no job, without reading the offers", async () => {
    const { service, calls } = liveService({ "GET /conversations": { data: [{ ...anaRow, job: null }] } });

    assert.equal(await service.getQuoteSuggestion("c1"), null);
    assert.equal(calls.some((call) => call.path.startsWith("/offers")), false);
  });

  it("suggests nothing when the offer carries no suggested quote", async () => {
    const { service } = liveService({
      "GET /conversations": { data: [anaRow] },
      "GET /offers?status=accepted": { data: [{ id: "h1", suggestedQuote: null }] },
    });

    assert.equal(await service.getQuoteSuggestion("c1"), null);
  });

  it("reads the business name from GET /me", async () => {
    const { service, calls } = liveService({
      "GET /me": { data: { userId: "u1", businesses: [{ id: "t1", name: "Northside Plumbing", shortName: "Northside" }] } },
    });

    assert.equal(await service.getBusinessName(), "Northside Plumbing");
    assert.deepEqual(calls, [{ method: "GET", path: "/me", body: undefined }]);
  });
});
