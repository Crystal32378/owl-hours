// The public Facebook Login callback (odd/tasks/owner-meta-publishing.md S2, S5): GET /v1/meta/callback.
// Meta is a fake Graph API; the service_role database is a fake Supabase client.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { signOAuthState } from "../src/meta/oauth-state.ts";
import { graphError } from "./helpers/fake-graph.ts";
import { pgError } from "./helpers/fake-supabase.ts";
import {
  APP_SECRET, LONG_TOKEN, MARIO, NORTHSIDE, NOW, PAGE_TOKEN, SERVER_KEY, SHORT_TOKEN,
  linkingGraph, page, proofOf, redirectOf, setup, validState,
} from "./helpers/meta-app.ts";

describe("GET /v1/meta/callback", () => {
  it("exchanges the code, stores the long-lived Page token for the Page and its Instagram account, then returns the owner", async () => {
    const { callback, graphCalls, serviceCalls } = setup();

    const response = await callback(`code=auth-code-123&state=${validState()}`);

    assert.equal(redirectOf(response).href, "https://owner.zukki.test/content/accounts?meta=linked");
    const [exchange, longLived, accounts] = graphCalls;
    assert.deepEqual(Object.fromEntries(exchange!.params), {
      client_id: "1234567890123",
      redirect_uri: "https://api.zukki.test/v1/meta/callback",
      client_secret: APP_SECRET,
      code: "auth-code-123",
    });
    assert.deepEqual(Object.fromEntries(longLived!.params), {
      grant_type: "fb_exchange_token",
      client_id: "1234567890123",
      client_secret: APP_SECRET,
      fb_exchange_token: SHORT_TOKEN,
    });
    assert.equal(accounts!.params.get("access_token"), LONG_TOKEN);
    assert.equal(accounts!.params.get("appsecret_proof"), proofOf(LONG_TOKEN));
    assert.equal(accounts!.params.get("fields"), "id,name,access_token,instagram_business_account{id,username}");
    assert.deepEqual(serviceCalls.map((call) => [call.path, call.body]), [
      ["/rest/v1/rpc/save_linked_account", {
        p_tenant_id: NORTHSIDE, p_user_id: MARIO, p_platform: "facebook_page",
        p_external_id: "555000111", p_display_name: "Northside Plumbing", p_token: PAGE_TOKEN,
      }],
      ["/rest/v1/rpc/save_linked_account", {
        p_tenant_id: NORTHSIDE, p_user_id: MARIO, p_platform: "instagram",
        p_external_id: "17841400000000001", p_display_name: "@northside_plumbing", p_token: PAGE_TOKEN,
      }],
    ]);
  });

  it("links only the Page when it has no Instagram professional account", async () => {
    const { callback, serviceCalls } = setup({
      graph: (call) => call.path === "/v26.0/me/accounts"
        ? { body: { data: [{ id: page.id, name: page.name, access_token: PAGE_TOKEN }] } }
        : linkingGraph(call),
    });

    assert.equal(redirectOf(await callback(`code=c&state=${validState()}`)).searchParams.get("meta"), "linked");
    assert.deepEqual(serviceCalls.map((call) => (call.body as { p_platform: string }).p_platform), ["facebook_page"]);
  });

  for (const [label, state] of [
    ["a forged", signOAuthState({ tenantId: NORTHSIDE, userId: MARIO }, "another-key-0123456789-0123456789-01", NOW)],
    ["an expired", signOAuthState({ tenantId: NORTHSIDE, userId: MARIO }, SERVER_KEY, NOW - 11 * 60_000)],
    ["a missing", ""],
  ] as const) {
    it(`rejects ${label} state without calling Meta or the database`, async () => {
      const { callback, graphCalls, serviceCalls } = setup();

      const location = redirectOf(await callback(`code=c&state=${state}`));

      assert.equal(location.href, "https://owner.zukki.test/content/accounts?meta=error&reason=invalid_state");
      assert.equal(graphCalls.length, 0);
      assert.equal(serviceCalls.length, 0);
    });
  }

  it("returns the owner with reason denied when they cancel the dialog", async () => {
    const { callback, graphCalls } = setup();

    const location = redirectOf(await callback(`error=access_denied&error_reason=user_denied&state=${validState()}`));

    assert.equal(location.searchParams.get("reason"), "denied");
    assert.equal(graphCalls.length, 0);
  });

  it("stores nothing and never logs a token when Meta rejects the exchange", async (t) => {
    const logged: string[] = [];
    t.mock.method(console, "error", (...args: unknown[]) => logged.push(args.map(String).join(" ")));
    const { callback, serviceCalls } = setup({
      graph: (call) => call.params.has("fb_exchange_token") ? graphError("Invalid OAuth access token.") : linkingGraph(call),
    });

    const location = redirectOf(await callback(`code=c&state=${validState()}`));

    assert.equal(location.searchParams.get("reason"), "meta_error");
    assert.equal(serviceCalls.length, 0);
    assert.doesNotMatch(logged.join("\n"), new RegExp(`${SHORT_TOKEN}|${APP_SECRET}`));
  });

  it("returns the owner with reason no_pages when no Page was shared", async () => {
    const { callback, serviceCalls } = setup({
      graph: (call) => call.path === "/v26.0/me/accounts" ? { body: { data: [] } } : linkingGraph(call),
    });

    assert.equal(redirectOf(await callback(`code=c&state=${validState()}`)).searchParams.get("reason"), "no_pages");
    assert.equal(serviceCalls.length, 0);
  });

  it("returns the owner with reason forbidden when the user no longer owns the business", async () => {
    const { callback } = setup({ service: () => pgError("42501", "only the business owner can link accounts", 403) });

    assert.equal(redirectOf(await callback(`code=c&state=${validState()}`)).searchParams.get("reason"), "forbidden");
  });
});
