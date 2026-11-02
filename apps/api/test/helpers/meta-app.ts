// Shared setup for the Facebook Login route tests: the API with a fake Graph API,
// fake owner and service_role databases, and a fixed clock.
import { createHmac } from "node:crypto";
import assert from "node:assert/strict";
import { createApp } from "../../src/index.ts";
import type { MetaConfig } from "../../src/config.ts";
import { signOAuthState } from "../../src/meta/oauth-state.ts";
import type { V1Deps } from "../../src/routes/v1.ts";
import { fakeGraph, graphError, type GraphCall, type GraphReply } from "./fake-graph.ts";
import { fakeSupabase, type FakeCall, type FakeReply } from "./fake-supabase.ts";

export const MARIO = "20000000-0000-4000-8000-000000000001";
export const NORTHSIDE = "10000000-0000-4000-8000-000000000001";
export const ACCOUNT = "a0000000-0000-4000-8000-000000000001";
export const TOKEN = "owner-access-token-0123456789";
export const SERVER_KEY = "server-key-0123456789-0123456789-0123";
export const APP_SECRET = "app-secret-0123456789";
export const NOW = Date.parse("2026-11-01T12:00:00Z");
export const SHORT_TOKEN = "short-lived-user-token-0123456789";
export const LONG_TOKEN = "long-lived-user-token-0123456789";
export const PAGE_TOKEN = "page-access-token-0123456789";

export const meta: MetaConfig = {
  appId: "1234567890123",
  appSecret: APP_SECRET,
  graphVersion: "v26.0",
  redirectUri: "https://api.zukki.test/v1/meta/callback",
  ownerReturnUrl: "https://owner.zukki.test/content/accounts",
  loginConfigId: undefined,
};

export const page = {
  id: "555000111",
  name: "Northside Plumbing",
  access_token: PAGE_TOKEN,
  instagram_business_account: { id: "17841400000000001", username: "northside_plumbing" },
};

export function linkingGraph(call: GraphCall): GraphReply {
  if (call.path === "/v26.0/oauth/access_token" && call.params.has("code")) {
    return { body: { access_token: SHORT_TOKEN, token_type: "bearer", expires_in: 3600 } };
  }
  if (call.path === "/v26.0/oauth/access_token") {
    return { body: { access_token: LONG_TOKEN, token_type: "bearer", expires_in: 5183944 } };
  }
  if (call.path === "/v26.0/me/accounts") return { body: { data: [page] } };
  return graphError(`unexpected ${call.path}`);
}

export type SetupOptions = {
  owner?: (call: FakeCall) => FakeReply;
  service?: (call: FakeCall) => FakeReply;
  graph?: (call: GraphCall) => GraphReply;
  meta?: MetaConfig | null;
};

export function setup(options: SetupOptions = {}) {
  const owner = fakeSupabase(options.owner ?? (() => ({ body: NORTHSIDE })));
  const service = fakeSupabase(options.service ?? (() => ({ body: ACCOUNT })));
  const graph = fakeGraph(options.graph ?? linkingGraph);
  const deps: V1Deps = {
    authenticate: async (token) => (token === TOKEN ? { userId: MARIO, db: owner.client } : null),
    serviceDb: service.client,
    serverKey: SERVER_KEY,
    now: () => NOW,
    ...(options.meta === null ? {} : { meta: { config: options.meta ?? meta, fetch: graph.fetch } }),
  };
  const { app } = createApp({ v1: deps });
  const ownerCall = (path: string, init: RequestInit = {}) =>
    app.request(`/v1/owner${path}`, { ...init, headers: { authorization: `Bearer ${TOKEN}`, ...init.headers } });
  const callback = (query: string) => app.request(`/v1/meta/callback?${query}`);
  return { ownerCall, callback, ownerCalls: owner.calls, serviceCalls: service.calls, graphCalls: graph.calls };
}

export const validState = () => signOAuthState({ tenantId: NORTHSIDE, userId: MARIO }, SERVER_KEY, NOW);
export const proofOf = (token: string) => createHmac("sha256", APP_SECRET).update(token).digest("hex");

export async function connectUrl(response: Response): Promise<URL> {
  assert.equal(response.status, 200);
  return new URL(((await response.json()) as { data: { url: string } }).data.url);
}

export function redirectOf(response: Response): URL {
  assert.equal(response.status, 302);
  return new URL(response.headers.get("location") ?? "");
}
