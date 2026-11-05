// Starting a Facebook Login and unlinking (odd/tasks/owner-meta-publishing.md S2, S5):
// GET /v1/owner/meta/connect-url and DELETE /v1/owner/linked-accounts/:id.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readOAuthState } from "../src/meta/oauth-state.ts";
import { pgError } from "./helpers/fake-supabase.ts";
import { ACCOUNT, APP_SECRET, MARIO, NORTHSIDE, NOW, SERVER_KEY, connectUrl, meta, setup } from "./helpers/meta-app.ts";

describe("GET /v1/owner/meta/connect-url", () => {
  it("answers the Facebook Login dialog for the owner's business with the publishing permissions", async () => {
    const { ownerCall, ownerCalls } = setup();

    const url = await connectUrl(await ownerCall("/meta/connect-url"));

    assert.equal(`${url.origin}${url.pathname}`, "https://www.facebook.com/v26.0/dialog/oauth");
    assert.equal(url.searchParams.get("client_id"), "1234567890123");
    assert.equal(url.searchParams.get("redirect_uri"), "https://api.zukki.test/v1/meta/callback");
    assert.equal(url.searchParams.get("response_type"), "code");
    assert.equal(url.searchParams.get("scope"),
      "pages_show_list,pages_read_engagement,pages_manage_posts,instagram_basic,instagram_content_publish");
    assert.deepEqual(readOAuthState(url.searchParams.get("state") ?? "", SERVER_KEY, NOW)?.owner, { tenantId: NORTHSIDE, userId: MARIO });
    assert.doesNotMatch(url.href, new RegExp(APP_SECRET));
    assert.equal(ownerCalls[0]?.path, "/rest/v1/rpc/caller_owned_business_id");
  });

  it("uses the Facebook Login for Business configuration instead of scopes when one is set", async () => {
    const { ownerCall } = setup({ meta: { ...meta, loginConfigId: "998877665544" } });

    const url = await connectUrl(await ownerCall("/meta/connect-url"));

    assert.equal(url.searchParams.get("config_id"), "998877665544");
    assert.equal(url.searchParams.has("scope"), false);
  });

  it("ignores a business id from the client", async () => {
    const { ownerCall } = setup();

    const url = await connectUrl(await ownerCall(`/meta/connect-url?tenantId=10000000-0000-4000-8000-000000000002`));

    assert.equal(readOAuthState(url.searchParams.get("state") ?? "", SERVER_KEY, NOW)?.owner.tenantId, NORTHSIDE);
  });

  it("signs the native app as the return target when it asks with return=app, and the web app otherwise", async () => {
    const { ownerCall } = setup();

    const app = await connectUrl(await ownerCall("/meta/connect-url?return=app"));
    const web = await connectUrl(await ownerCall("/meta/connect-url"));

    assert.equal(readOAuthState(app.searchParams.get("state") ?? "", SERVER_KEY, NOW)?.returnTo, "app");
    assert.equal(readOAuthState(web.searchParams.get("state") ?? "", SERVER_KEY, NOW)?.returnTo, "web");
  });

  it("refuses any other return target, so a client cannot choose where the callback redirects", async () => {
    const { ownerCall } = setup();

    const response = await ownerCall(`/meta/connect-url?return=${encodeURIComponent("https://evil.example")}`);

    assert.equal(response.status, 400);
    assert.equal(((await response.json()) as { error: { code: string } }).error.code, "invalid_query");
  });

  it("refuses staff, who cannot link accounts for the business", async () => {
    const { ownerCall } = setup({ owner: () => pgError("42501", "only the business owner can change it", 403) });

    assert.equal((await ownerCall("/meta/connect-url")).status, 403);
  });

  it("requires the owner's token", async () => {
    const { ownerCall } = setup();

    assert.equal((await ownerCall("/meta/connect-url", { headers: { authorization: "" } })).status, 401);
  });

  it("answers 503 when Facebook Login is not configured on the server", async () => {
    const { ownerCall } = setup({ meta: null });

    const response = await ownerCall("/meta/connect-url");

    assert.equal(response.status, 503);
    assert.equal(((await response.json()) as { error: { code: string } }).error.code, "not_configured");
  });
});

describe("DELETE /v1/owner/linked-accounts/:id", () => {
  it("unlinks the account as the owner, so RLS limits it to their business", async () => {
    const { ownerCall, ownerCalls, serviceCalls } = setup({ owner: () => ({ body: [{ id: ACCOUNT }] }) });

    const response = await ownerCall(`/linked-accounts/${ACCOUNT}`, { method: "DELETE" });

    assert.equal(response.status, 200);
    assert.deepEqual(((await response.json()) as { data: unknown }).data, { id: ACCOUNT });
    assert.equal(ownerCalls[0]?.method, "DELETE");
    assert.equal(ownerCalls[0]?.path, "/rest/v1/linked_accounts");
    assert.equal(ownerCalls[0]?.query.get("id"), `eq.${ACCOUNT}`);
    assert.equal(serviceCalls.length, 0);
  });

  it("answers 404 for an account the owner cannot see", async () => {
    const { ownerCall } = setup({ owner: () => ({ body: [] }) });

    assert.equal((await ownerCall(`/linked-accounts/${ACCOUNT}`, { method: "DELETE" })).status, 404);
  });
});
