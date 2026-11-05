// Owner endpoints: login required, every query runs as the owner, input is
// validated before the database, and errors keep a stable shape.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { ChatChoice } from "@owl-hours/meta-models";
import { createApp } from "../src/index.ts";
import type { V1Deps } from "../src/routes/v1.ts";
import { fakeSupabase, pgError, type FakeCall, type FakeReply } from "./helpers/fake-supabase.ts";

const MARIO = "20000000-0000-4000-8000-000000000001";
const ANA_CHAT = "40000000-0000-4000-8000-000000000001";
const ANA_OFFER = "50000000-0000-4000-8000-000000000001";
const ANA_JOB = "80000000-0000-4000-8000-000000000001";
const NORTHSIDE = "10000000-0000-4000-8000-000000000001";
const TOKEN = "owner-access-token-0123456789";
const SERVER_KEY = "server-key-0123456789-0123456789-0123";

function setup(respond: (call: FakeCall) => FakeReply, extra: Partial<V1Deps> = {}) {
  const owner = fakeSupabase(respond);
  const service = fakeSupabase(() => ({ body: [] }));
  const deps: V1Deps = {
    authenticate: async (token) => (token === TOKEN ? { userId: MARIO, db: owner.client } : null),
    serviceDb: service.client,
    serverKey: SERVER_KEY,
    ...extra,
  };
  const { app } = createApp({ v1: deps });
  const call = (path: string, init: RequestInit = {}) =>
    app.request(`/v1/owner${path}`, {
      ...init,
      headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json", ...init.headers },
    });
  return { app, call, calls: owner.calls, serviceCalls: service.calls };
}

const post = (body: unknown): RequestInit => ({ method: "POST", body: JSON.stringify(body) });

describe("/v1/owner auth", () => {
  it("rejects a missing or unknown token before touching the database", async () => {
    const { app, calls } = setup(() => ({ body: [] }));
    const missing = await app.request("/v1/owner/offers");
    assert.equal(missing.status, 401);
    assert.deepEqual(await missing.json(), {
      success: false,
      error: { code: "unauthorized", message: "Sign in to continue." },
    });
    const wrong = await app.request("/v1/owner/offers", { headers: { authorization: "Bearer someone-elses-token-000000" } });
    assert.equal(wrong.status, 401);
    assert.equal(calls.length, 0);
  });

  it("answers 503 with the reason when the API is not configured", async () => {
    const { app } = createApp({ v1: { unavailable: "Missing or invalid environment variables: ZUKKI_SERVER_KEY" } });
    const res = await app.request("/v1/owner/offers");
    assert.equal(res.status, 503);
    assert.match(JSON.stringify(await res.json()), /ZUKKI_SERVER_KEY/);
  });
});

describe("/v1/owner offers", () => {
  it("lists offers as the owner and swaps storage paths for signed links", async () => {
    const { call, calls } = setup((c) => {
      if (c.path.endsWith("/rpc/owner_offers")) {
        return {
          body: [{
            id: ANA_OFFER,
            customerName: "Ana L.",
            media: [{ id: "m1", kind: "video", storagePath: `conversations/${ANA_CHAT}/toilet-leak.mp4`, thumbPath: null }],
          }],
        };
      }
      if (c.path === "/storage/v1/object/sign/media") {
        return { body: [{ path: `conversations/${ANA_CHAT}/toilet-leak.mp4`, signedURL: "/object/sign/media/x?token=t", error: null }] };
      }
      return { status: 500, body: {} };
    });

    const res = await call("/offers?status=accepted");
    assert.equal(res.status, 200);
    const body = (await res.json()) as { success: boolean; data: { media: Record<string, unknown>[] }[] };
    assert.equal(body.success, true);
    assert.deepEqual(calls[0]?.body, { p_status: "accepted", p_limit: 50 });
    const media = body.data[0]?.media[0];
    assert.equal(media?.storagePath, undefined, "no raw storage path");
    assert.match(String(media?.url), /^https:\/\/example\.supabase\.co\/storage\/v1\/object\/sign\/.+token=t/);
    assert.deepEqual((calls[1]?.body as { expiresIn: number }).expiresIn, 600);
  });

  it("reads one offer by id with signed media links, and 404s one it cannot see", async () => {
    const { call, calls } = setup((c) => {
      if (c.path.endsWith("/rpc/owner_offer")) {
        const found = (c.body as { p_handoff_id: string }).p_handoff_id === ANA_OFFER;
        return {
          body: found
            ? { id: ANA_OFFER, customerName: "Ana L.", media: [{ id: "m1", kind: "video", storagePath: `conversations/${ANA_CHAT}/v.mp4`, thumbPath: null }] }
            : null,
        };
      }
      if (c.path === "/storage/v1/object/sign/media") {
        return { body: [{ path: `conversations/${ANA_CHAT}/v.mp4`, signedURL: "/object/sign/media/x?token=t", error: null }] };
      }
      return { status: 500, body: {} };
    });

    const res = await call(`/offers/${ANA_OFFER}`);
    assert.equal(res.status, 200);
    const body = (await res.json()) as { data: { customerName: string; media: Record<string, unknown>[] } };
    assert.deepEqual(calls[0]?.body, { p_handoff_id: ANA_OFFER });
    assert.equal(body.data.customerName, "Ana L.");
    assert.match(String(body.data.media[0]?.url), /token=t/);
    assert.equal(body.data.media[0]?.storagePath, undefined);

    const missing = await call("/offers/50000000-0000-4000-8000-0000000000ff");
    assert.equal(missing.status, 404);
  });

  it("declines with reason other when the app sends none", async () => {
    const { call, calls } = setup(() => ({
      body: { id: ANA_OFFER, status: "declined", expires_at: "2026-11-03T05:10:00Z", resolved_at: "2026-11-03T05:06:00Z", decline_reason: "other" },
    }));
    const res = await call(`/offers/${ANA_OFFER}/decline`, { method: "POST" });
    assert.equal(res.status, 200);
    assert.deepEqual(calls[0]?.body, { p_handoff_id: ANA_OFFER, p_reason: "other", p_note: null });
  });

  it("rejects an unknown status filter", async () => {
    const { call, calls } = setup(() => ({ body: [] }));
    const res = await call("/offers?status=everything");
    assert.equal(res.status, 400);
    assert.equal(calls.length, 0);
  });

  it("turns a late accept into 409 offer_expired", async () => {
    const { call } = setup(() => ({
      body: { id: ANA_OFFER, status: "expired", expires_at: "2026-11-03T05:10:00Z", resolved_at: "2026-11-03T05:11:00Z" },
    }));
    const res = await call(`/offers/${ANA_OFFER}/accept`, { method: "POST" });
    assert.equal(res.status, 409);
    assert.equal(((await res.json()) as { error: { code: string } }).error.code, "offer_expired");
  });

  it("maps database errors to statuses and hides unexpected ones", async () => {
    const notYours = setup(() => pgError("P0002", "handoff not found"));
    const res = await notYours.call(`/offers/${ANA_OFFER}/decline`, post({ reason: "busy" }));
    assert.equal(res.status, 404);
    assert.deepEqual(await res.json(), { success: false, error: { code: "not_found", message: "handoff not found" } });

    const broken = setup(() => pgError("XX000", "internal detail: relation pg_secret", 500));
    const original = console.error;
    console.error = () => {};
    try {
      const hidden = await broken.call(`/offers/${ANA_OFFER}/decline`, post({ reason: "busy" }));
      assert.equal(hidden.status, 500);
      assert.doesNotMatch(JSON.stringify(await hidden.json()), /pg_secret/);
    } finally {
      console.error = original;
    }
  });

  it("rejects a non-uuid id and unknown decline reasons", async () => {
    const { call, calls } = setup(() => ({ body: {} }));
    assert.equal((await call("/offers/abc/accept", { method: "POST" })).status, 400);
    assert.equal((await call(`/offers/${ANA_OFFER}/decline`, post({ reason: "lazy" }))).status, 400);
    assert.equal(calls.length, 0);
  });
});

describe("/v1/owner chat", () => {
  it("sends a message only in an accepted chat, authored by the signed-in owner", async () => {
    const { call, calls } = setup((c) => {
      if (c.path === "/rest/v1/handoffs") {
        return { body: [{ tenant_id: NORTHSIDE }] };
      }
      return { status: 201, body: { id: "70000000-0000-4000-8000-000000000099", created_at: "2026-11-03T05:07:00Z", delivery: "queued" } };
    });
    const res = await call(`/conversations/${ANA_CHAT}/messages`, post({ text: "  On my way  " }));
    assert.equal(res.status, 201);
    assert.equal(calls[0]?.query.get("status"), "eq.accepted");
    assert.deepEqual(calls[1]?.body, {
      conversation_id: ANA_CHAT,
      tenant_id: NORTHSIDE,
      sender: "owner",
      author_user_id: MARIO,
      body: "On my way",
    });
    const body = (await res.json()) as { data: { delivery: string; status: string } };
    assert.equal(body.data.delivery, "as_written");
    assert.equal(body.data.status, "queued");
  });

  it("lists chats with the accept time and a page of messages with the sent quote, as the owner", async () => {
    const quote = {
      id: "a0000000-0000-4000-8000-000000000001",
      lines: [{ label: "Valve repair", min: 130, max: 160 }],
      total: { min: 130, max: 160 },
      arrivalFrom: "2026-11-03T05:55:00Z",
      arrivalTo: "2026-11-03T06:25:00Z",
      note: null,
      technician: "Mario",
    };
    const chat = { id: ANA_CHAT, offerId: ANA_OFFER, acceptedAt: "2026-11-03T05:05:28Z", job: { id: ANA_JOB, state: "owner_confirmed" } };
    const quoteMessage = {
      id: "70000000-0000-4000-8000-000000000099", from: "owner", kind: "interactive", text: "Estimated total: $130–160",
      payload: { variant: "quote" }, sentAt: "2026-11-03T05:10:00Z", status: "sent", delivery: null, media: null, quote,
    };
    const { call, calls } = setup((c) => {
      if (c.path.endsWith("/rpc/owner_conversations")) return { body: [chat] };
      if (c.path.endsWith("/rpc/owner_conversation_messages")) return { body: [quoteMessage] };
      return { status: 500, body: {} };
    });

    const chats = await call("/conversations");
    const messages = await call(`/conversations/${ANA_CHAT}/messages`);

    assert.deepEqual(await chats.json(), { success: true, data: [chat] });
    assert.deepEqual(await messages.json(), { success: true, data: [{ ...quoteMessage, media: null }] });
    assert.deepEqual(calls.map((c) => c.path), ["/rest/v1/rpc/owner_conversations", "/rest/v1/rpc/owner_conversation_messages"]);
  });

  it("refuses to write in a chat the business has not accepted", async () => {
    const { call, calls } = setup(() => ({ body: [] }));
    const res = await call(`/conversations/${ANA_CHAT}/messages`, post({ text: "hello" }));
    assert.equal(res.status, 422);
    assert.equal(((await res.json()) as { error: { code: string } }).error.code, "chat_closed");
    assert.equal(calls.length, 1, "no insert attempted");
  });

  it("rejects empty text and unknown fields", async () => {
    const { call, calls } = setup(() => ({ body: [] }));
    assert.equal((await call(`/conversations/${ANA_CHAT}/messages`, post({ text: "   " }))).status, 400);
    assert.equal((await call(`/conversations/${ANA_CHAT}/messages`, post({ text: "hi", tenant_id: NORTHSIDE }))).status, 400);
    assert.equal(calls.length, 0);
  });

  it("drafts with Zukki's version and stores it through the server, scoped to the author", async () => {
    const reply = (content: string): ChatChoice => ({ finishReason: "stop", message: { role: "assistant", content } });
    const { call, serviceCalls } = setup(
      (c) =>
        c.path === "/rest/v1/handoffs"
          ? { body: [{ tenant_id: NORTHSIDE }] }
          : { status: 201, body: { id: "d0000000-0000-4000-8000-000000000001" } },
      {
        chat: async () =>
          reply(JSON.stringify({ language: "en", text: "Hi Ana, Mario can be there at 12:55 AM. The visit is $45." })),
      },
    );
    const res = await call(`/conversations/${ANA_CHAT}/drafts`, post({ text: "ok mario there 12:55, visit 45" }));
    assert.equal(res.status, 201);
    const body = (await res.json()) as { data: { polished: string; language: string } };
    assert.match(body.data.polished, /12:55 AM/);
    assert.equal(serviceCalls[0]?.method, "PATCH");
    assert.equal(serviceCalls[0]?.query.get("author_user_id"), `eq.${MARIO}`);
    assert.equal(serviceCalls[0]?.query.get("status"), "eq.pending");
  });
});

describe("/v1/owner jobs", () => {
  it("sends a quote with its lines and arrival window", async () => {
    const { call, calls } = setup(() => ({
      body: {
        id: "a0000000-0000-4000-8000-000000000001",
        job_id: ANA_JOB,
        status: "sent",
        total_min: 130,
        total_max: 160,
        arrival_from: "2026-11-03T05:55:00Z",
        arrival_to: "2026-11-03T06:25:00Z",
      },
    }));
    const lines = [
      { label: "Visit", min: 45, max: 45 },
      { label: "Night fee", min: 25, max: 25 },
      { label: "Fill valve repair", min: 60, max: 90 },
    ];
    const res = await call(
      `/jobs/${ANA_JOB}/quote`,
      post({ lines, arrivalFrom: "2026-11-03T05:55:00Z", arrivalTo: "2026-11-03T06:25:00Z" }),
    );
    assert.equal(res.status, 201);
    assert.equal(calls[0]?.path, "/rest/v1/rpc/send_quote");
    assert.deepEqual((calls[0]?.body as { p_lines: unknown }).p_lines, lines);
    assert.deepEqual(((await res.json()) as { data: { total: unknown } }).data.total, { min: 130, max: 160 });
  });

  it("rejects a line whose max is below its min, and an arrival that ends first", async () => {
    const { call, calls } = setup(() => ({ body: {} }));
    const bad = await call(
      `/jobs/${ANA_JOB}/quote`,
      post({ lines: [{ label: "Visit", min: 50, max: 40 }], arrivalFrom: "2026-11-03T05:55:00Z", arrivalTo: "2026-11-03T06:25:00Z" }),
    );
    assert.equal(bad.status, 400);
    const backwards = await call(
      `/jobs/${ANA_JOB}/quote`,
      post({ lines: [{ label: "Visit", min: 45, max: 45 }], arrivalFrom: "2026-11-03T06:25:00Z", arrivalTo: "2026-11-03T05:55:00Z" }),
    );
    assert.equal(backwards.status, 400);
    assert.equal(calls.length, 0);
  });

  it("lets the owner move a job only to owner states", async () => {
    const { call, calls } = setup(() => ({ body: { id: ANA_JOB, state: "en_route" } }));
    assert.equal((await call(`/jobs/${ANA_JOB}/transition`, post({ to: "customer_approved", reason: "x" }))).status, 400);
    const res = await call(`/jobs/${ANA_JOB}/transition`, post({ to: "en_route", reason: "Start trip" }));
    assert.equal(res.status, 200);
    assert.deepEqual(calls[0]?.body, { p_job_id: ANA_JOB, p_to: "en_route", p_reason: "Start trip" });
  });

  it("answers 404 for a job the owner cannot see", async () => {
    const { call } = setup(() => ({ body: [] }));
    assert.equal((await call(`/jobs/${ANA_JOB}`)).status, 404);
  });

  it("answers 503 for Test Zukki until the model is connected", async () => {
    const { call } = setup(() => ({ body: [] }));
    const res = await call("/test-zukki", post({ question: "How much for a leak?" }));
    assert.equal(res.status, 503);
  });
});

describe("/v1 limits", () => {
  it("rate-limits an owner and says when to retry", async () => {
    let now = 0;
    const { call } = setup(() => ({ body: [] }), { now: () => now });
    for (let i = 0; i < 120; i += 1) {
      assert.equal((await call("/conversations")).status, 200);
    }
    const limited = await call("/conversations");
    assert.equal(limited.status, 429);
    assert.equal(limited.headers.get("retry-after"), "60");
    now = 60_001;
    assert.equal((await call("/conversations")).status, 200, "next window");
  });

  it("rejects bodies over 64 KB", async () => {
    const { call } = setup(() => ({ body: [] }));
    const res = await call(`/conversations/${ANA_CHAT}/messages`, post({ text: "x".repeat(70_000) }));
    assert.equal(res.status, 413);
  });
});
