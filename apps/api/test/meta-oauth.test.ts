// Facebook Login settings and the signed OAuth state (odd/tasks/owner-meta-publishing.md S2, S5).
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { loadMetaConfig } from "../src/config.ts";
import { readOAuthState, signOAuthState } from "../src/meta/oauth-state.ts";

const env = {
  META_APP_ID: "1234567890123",
  META_APP_SECRET: "app-secret-0123456789",
  API_PUBLIC_URL: "https://api.zukki.test/",
  OWNER_WEB_URL: "https://owner.zukki.test",
};

describe("loadMetaConfig", () => {
  it("reads the app, the callback and the return URL, on Graph API v26.0 by default", () => {
    assert.deepEqual(loadMetaConfig(env), {
      appId: "1234567890123",
      appSecret: "app-secret-0123456789",
      graphVersion: "v26.0",
      redirectUri: "https://api.zukki.test/v1/meta/callback",
      ownerReturnUrl: "https://owner.zukki.test/content/accounts",
      loginConfigId: undefined,
    });
  });

  it("takes an optional Graph version and Facebook Login for Business configuration", () => {
    const config = loadMetaConfig({ ...env, META_GRAPH_VERSION: "v25.0", META_LOGIN_CONFIG_ID: "998877665544" });
    assert.equal(config.graphVersion, "v25.0");
    assert.equal(config.loginConfigId, "998877665544");
  });

  it("names what is missing or invalid without printing values", () => {
    assert.throws(
      () => loadMetaConfig({ META_APP_SECRET: "app-secret-0123456789", API_PUBLIC_URL: "http://api.zukki.test" }),
      (error: unknown) => {
        const message = String(error);
        assert.match(message, /META_APP_ID/);
        assert.match(message, /API_PUBLIC_URL/);
        assert.match(message, /OWNER_WEB_URL/);
        assert.doesNotMatch(message, /app-secret/);
        return true;
      },
    );
  });
});

describe("OAuth state", () => {
  const KEY = "server-key-0123456789-0123456789-0123";
  const owner = { tenantId: "10000000-0000-4000-8000-000000000001", userId: "20000000-0000-4000-8000-000000000001" };
  const NOW = Date.parse("2026-11-01T12:00:00Z");

  it("reads back the business and user it was signed for", () => {
    const state = signOAuthState(owner, KEY, NOW);

    assert.deepEqual(readOAuthState(state, KEY, NOW + 60_000)?.owner, owner);
  });

  it("is different on every sign, so it cannot be predicted", () => {
    assert.notEqual(signOAuthState(owner, KEY, NOW), signOAuthState(owner, KEY, NOW));
  });

  it("expires after ten minutes", () => {
    const state = signOAuthState(owner, KEY, NOW);

    assert.deepEqual(readOAuthState(state, KEY, NOW + 9 * 60_000)?.owner, owner);
    assert.equal(readOAuthState(state, KEY, NOW + 10 * 60_000 + 1), null);
  });

  it("rejects a state signed with another key", () => {
    const state = signOAuthState(owner, "another-key-0123456789-0123456789-01", NOW);

    assert.equal(readOAuthState(state, KEY, NOW), null);
  });

  it("rejects a state whose business was swapped", () => {
    const [version, payload, signature] = signOAuthState(owner, KEY, NOW).split(".");
    const forged = JSON.parse(Buffer.from(payload!, "base64url").toString()) as Record<string, unknown>;
    forged.t = "10000000-0000-4000-8000-000000000002";
    const tampered = [version, Buffer.from(JSON.stringify(forged)).toString("base64url"), signature].join(".");

    assert.equal(readOAuthState(tampered, KEY, NOW), null);
  });

  it("rejects garbage", () => {
    for (const state of ["", "v1", "v1.e30.", "v2.a.b", "not a state at all"]) {
      assert.equal(readOAuthState(state, KEY, NOW), null, state);
    }
  });
});
