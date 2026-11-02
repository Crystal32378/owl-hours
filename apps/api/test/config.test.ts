// Startup config: fail fast on missing settings without echoing secrets.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { loadConfig, loadWhatsAppConfig } from "../src/config.ts";

describe("loadWhatsAppConfig", () => {
  const env = {
    WHATSAPP_ACCESS_TOKEN: "test-access-token-0123456789",
    WHATSAPP_PHONE_NUMBER_ID: "123456789012345",
    WHATSAPP_VERIFY_TOKEN: "verify-token-0123456789",
    META_APP_SECRET: "app-secret-0123456789",
  };

  it("reads the settings, graph version optional", () => {
    const config = loadWhatsAppConfig({ ...env, WHATSAPP_GRAPH_VERSION: "" });
    assert.equal(config.phoneNumberId, "123456789012345");
    assert.equal(config.graphVersion, undefined);
    assert.equal(loadWhatsAppConfig({ ...env, WHATSAPP_GRAPH_VERSION: "v24.0" }).graphVersion, "v24.0");
  });

  it("reads a loopback Graph host and refuses any other, naming the variable and not the value", () => {
    assert.equal(loadWhatsAppConfig(env).graphHost, undefined);
    assert.equal(loadWhatsAppConfig({ ...env, WHATSAPP_GRAPH_HOST: "http://127.0.0.1:4010/" }).graphHost, "http://127.0.0.1:4010");
    assert.equal(loadWhatsAppConfig({ ...env, WHATSAPP_GRAPH_HOST: "http://localhost:4010" }).graphHost, "http://localhost:4010");
    for (const host of ["https://evil.example", "http://127.0.0.1.evil.example", "http://localhost@evil.example"]) {
      assert.throws(
        () => loadWhatsAppConfig({ ...env, WHATSAPP_GRAPH_HOST: host }),
        (error: unknown) => {
          assert.match(String(error), /WHATSAPP_GRAPH_HOST/);
          assert.doesNotMatch(String(error), /evil/);
          return true;
        },
      );
    }
  });

  it("names what is missing without printing values", () => {
    assert.throws(
      () => loadWhatsAppConfig({ WHATSAPP_ACCESS_TOKEN: "short", WHATSAPP_PHONE_NUMBER_ID: "+1 555" }),
      (error: unknown) => {
        const message = String(error);
        assert.match(message, /WHATSAPP_ACCESS_TOKEN/);
        assert.match(message, /META_APP_SECRET/);
        assert.match(message, /WHATSAPP_VERIFY_TOKEN/);
        assert.doesNotMatch(message, /short|\+1 555/);
        return true;
      },
    );
  });
});

describe("loadConfig", () => {
  const required = {
    META_MODEL_API_KEY: "meta-test",
    SUPABASE_URL: "https://abc.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "service-role-test-key-0123456789",
    SUPABASE_ANON_KEY: "anon-test-key-0123456789-0123456789",
    ZUKKI_SERVER_KEY: "server-key-0123456789-0123456789-0123",
  };

  it("reads a loopback model URL and refuses any other, so the key only ever reaches Meta or this machine", () => {
    assert.equal(loadConfig(required).metaModelBaseUrl, undefined);
    assert.equal(loadConfig({ ...required, META_MODEL_BASE_URL: "http://127.0.0.1:4011/v1" }).metaModelBaseUrl, "http://127.0.0.1:4011/v1");
    assert.throws(() => loadConfig({ ...required, META_MODEL_BASE_URL: "https://evil.example/v1" }), /META_MODEL_BASE_URL/);
  });

  it("reads the required settings", () => {
    const config = loadConfig({
      META_MODEL_API_KEY: "meta-test",
      SUPABASE_URL: "https://abc.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "service-role-test-key-0123456789",
      SUPABASE_ANON_KEY: "anon-test-key-0123456789-0123456789",
      ZUKKI_SERVER_KEY: "server-key-0123456789-0123456789-0123",
    });
    assert.equal(config.supabaseUrl, "https://abc.supabase.co");
    assert.equal(config.serverKey, "server-key-0123456789-0123456789-0123");
  });

  it("names what is missing or invalid but never prints values", () => {
    assert.throws(
      () => loadConfig({ SUPABASE_URL: "not a url", SUPABASE_SERVICE_ROLE_KEY: "short-secret" }),
      (error: unknown) => {
        const message = String(error);
        assert.match(message, /META_MODEL_API_KEY/);
        assert.match(message, /SUPABASE_URL/);
        assert.match(message, /SUPABASE_SERVICE_ROLE_KEY/);
        assert.match(message, /ZUKKI_SERVER_KEY/);
        assert.doesNotMatch(message, /short-secret|not a url/);
        return true;
      },
    );
  });
});
