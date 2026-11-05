// GET /v1/owner/linked-accounts: the owner's Facebook Page and Instagram links, read as the owner.
// Tenant isolation and the hidden token_secret_id column are enforced by RLS and column grants
// (supabase/tests/rls.test.sql); this route only reads through the owner's client and never
// asks for, nor returns, anything secret.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../src/index.ts";
import type { V1Deps } from "../src/routes/v1.ts";
import { fakeSupabase, pgError, type FakeCall, type FakeReply } from "./helpers/fake-supabase.ts";

const MARIO = "20000000-0000-4000-8000-000000000001";
const NORTHSIDE = "10000000-0000-4000-8000-000000000001";
const PAGE = "a0000000-0000-4000-8000-000000000001";
const INSTAGRAM = "a0000000-0000-4000-8000-000000000002";
const TOKEN = "owner-access-token-0123456789";
const SERVER_KEY = "server-key-0123456789-0123456789-0123";

const pageRow = {
  id: PAGE,
  tenant_id: NORTHSIDE,
  platform: "facebook_page",
  external_id: "1234567890",
  display_name: "Northside Plumbing",
  token_secret_id: "f0000000-0000-4000-8000-000000000001",
  mode: "live",
  created_at: "2026-10-28T12:00:00.000Z",
  updated_at: "2026-10-28T12:00:00.000Z",
};
const instagramRow = { ...pageRow, id: INSTAGRAM, platform: "instagram", external_id: "987", display_name: null, mode: "test" };

function setup(respond: (call: FakeCall) => FakeReply) {
  const owner = fakeSupabase(respond);
  const service = fakeSupabase(() => ({ body: [] }));
  const deps: V1Deps = {
    authenticate: async (token) => token === TOKEN ? { userId: MARIO, db: owner.client } : null,
    serviceDb: service.client,
    serverKey: SERVER_KEY,
  };
  const { app } = createApp({ v1: deps });
  const call = (path: string, headers: Record<string, string> = { authorization: `Bearer ${TOKEN}` }) =>
    app.request(`/v1/owner${path}`, { headers });
  return { call, calls: owner.calls, serviceCalls: service.calls };
}

describe("GET /v1/owner/linked-accounts", () => {
  it("lists the owner's linked accounts as platform, display name and mode, never a secret or tenant id", async () => {
    const { call } = setup(() => ({ body: [pageRow, instagramRow] }));

    const response = await call("/linked-accounts");

    assert.equal(response.status, 200);
    const body = await response.json() as { success: boolean; data: Record<string, unknown>[] };
    assert.equal(body.success, true);
    assert.deepEqual(body.data, [
      { id: PAGE, platform: "facebook_page", displayName: "Northside Plumbing", mode: "live" },
      { id: INSTAGRAM, platform: "instagram", displayName: null, mode: "test" },
    ]);
    assert.doesNotMatch(JSON.stringify(body), /token_secret|tokenSecret|tenant/i);
  });

  it("reads only public columns through the owner's own client, so RLS scopes it to the owner's tenants", async () => {
    const { call, calls, serviceCalls } = setup(() => ({ body: [] }));

    const response = await call("/linked-accounts");

    assert.equal(response.status, 200);
    assert.deepEqual(((await response.json()) as { data: unknown[] }).data, []);
    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.method, "GET");
    assert.equal(calls[0]?.path, "/rest/v1/linked_accounts");
    const select = calls[0]?.query.get("select") ?? "";
    assert.deepEqual(select.split(",").sort(), ["display_name", "id", "mode", "platform"]);
    assert.equal(calls[0]?.query.has("tenant_id"), false);
    assert.equal(serviceCalls.length, 0);
  });

  it("ignores a tenant id from the client", async () => {
    const { call, calls } = setup(() => ({ body: [] }));

    const response = await call(`/linked-accounts?tenantId=${NORTHSIDE}&tenant_id=${NORTHSIDE}`);

    assert.equal(response.status, 200);
    assert.equal(calls[0]?.query.has("tenant_id"), false);
    assert.equal(calls[0]?.query.has("tenantId"), false);
  });

  it("requires the owner's token", async () => {
    const { call, calls } = setup(() => ({ body: [pageRow] }));

    const response = await call("/linked-accounts", {});

    assert.equal(response.status, 401);
    assert.equal(calls.length, 0);
  });

  it("answers an error, not an empty list, when the database fails", async () => {
    const { call } = setup(() => pgError("XX000", "boom", 500));

    const response = await call("/linked-accounts");

    assert.equal(response.status >= 500, true);
    assert.equal(((await response.json()) as { success: boolean }).success, false);
  });
});
