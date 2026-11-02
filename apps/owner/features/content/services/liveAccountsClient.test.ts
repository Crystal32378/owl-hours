// Live AccountsClient over GET /v1/owner/linked-accounts, driven through createOwnerApi with a fake fetch.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createOwnerApi } from "../../../shared/infra/ownerApi.ts";
import { createLiveAccountsClient } from "./liveAccountsClient.ts";

const API = "https://api.example.com";

function fakeAccountsApi(answer: Response) {
  const calls: string[] = [];
  const fetch = (async (url: string, init: RequestInit) => {
    calls.push(`${init.method ?? "GET"} ${url}`);
    return answer.clone();
  }) as unknown as typeof globalThis.fetch;
  const api = createOwnerApi({ apiUrl: API, getAccessToken: async () => "tok", fetch });
  return { client: createLiveAccountsClient(api), calls };
}

describe("live accounts client", () => {
  it("lists each linked account from the API as connected, named by its display name", async () => {
    const { client, calls } = fakeAccountsApi(Response.json({
      success: true,
      data: [
        { id: "a0000000-0000-4000-8000-000000000001", platform: "facebook_page", displayName: "Northside Plumbing", mode: "live" },
        { id: "a0000000-0000-4000-8000-000000000002", platform: "instagram", displayName: null, mode: "test" },
      ],
    }));

    assert.deepEqual(await client.listAccounts(), [
      { id: "a0000000-0000-4000-8000-000000000001", kind: "facebook_page", name: "Northside Plumbing", status: "connected" },
      { id: "a0000000-0000-4000-8000-000000000002", kind: "instagram", name: "", status: "connected" },
    ]);
    assert.deepEqual(calls, [`GET ${API}/v1/owner/linked-accounts`]);
  });

  it("answers an empty list when nothing is linked", async () => {
    const { client } = fakeAccountsApi(Response.json({ success: true, data: [] }));

    assert.deepEqual(await client.listAccounts(), []);
  });

  it("rejects when the API fails, never a silent list", async () => {
    const { client } = fakeAccountsApi(
      Response.json({ success: false, error: { code: "internal", message: "Boom." } }, { status: 500 }),
    );

    await assert.rejects(client.listAccounts(), /Boom/);
  });

  it("rejects an answer that is not a list of accounts", async () => {
    const { client } = fakeAccountsApi(Response.json({ success: true, data: [{ id: "a1", platform: "tiktok" }] }));

    await assert.rejects(client.listAccounts());
  });

  it("answers the Facebook Login URL from GET /meta/connect-url (odd/tasks/owner-meta-publishing.md S4)", async () => {
    const url = "https://www.facebook.com/v26.0/dialog/oauth?client_id=1234567890123&state=v1.abc.def";
    const { client, calls } = fakeAccountsApi(Response.json({ success: true, data: { url } }));

    assert.equal(await client.connectUrl?.("web"), url);
    assert.deepEqual(calls, [`GET ${API}/v1/owner/meta/connect-url?return=web`]);
  });

  it("asks for a login that returns to the native app with return=app (D1)", async () => {
    const url = "https://www.facebook.com/v26.0/dialog/oauth?client_id=1234567890123&state=v1.abc.def";
    const { client, calls } = fakeAccountsApi(Response.json({ success: true, data: { url } }));

    assert.equal(await client.connectUrl?.("app"), url);
    assert.deepEqual(calls, [`GET ${API}/v1/owner/meta/connect-url?return=app`]);
  });

  it("unlinks an account with DELETE /linked-accounts/:id", async () => {
    const id = "a0000000-0000-4000-8000-000000000001";
    const { client, calls } = fakeAccountsApi(Response.json({ success: true, data: { id } }));

    await client.unlink?.(id);

    assert.deepEqual(calls, [`DELETE ${API}/v1/owner/linked-accounts/${id}`]);
  });

  it("rejects with the API's message when unlinking fails", async () => {
    const { client } = fakeAccountsApi(Response.json(
      { success: false, error: { code: "not_found", message: "Linked account not found." } },
      { status: 404 },
    ));

    await assert.rejects(client.unlink?.("a0000000-0000-4000-8000-000000000001") ?? Promise.resolve(), /not found/);
  });

  it("refuses a connect URL that is not Facebook's login dialog", async () => {
    const { client } = fakeAccountsApi(Response.json({ success: true, data: { url: "https://evil.example/dialog/oauth" } }));

    await assert.rejects(client.connectUrl?.("web") ?? Promise.resolve(), /Facebook/);
  });

  it("rejects with the API's message when Facebook is not configured", async () => {
    const { client } = fakeAccountsApi(Response.json(
      { success: false, error: { code: "not_configured", message: "Facebook and Instagram are not configured on this server." } },
      { status: 503 },
    ));

    await assert.rejects(client.connectUrl?.("web") ?? Promise.resolve(), /not configured/);
  });
});
