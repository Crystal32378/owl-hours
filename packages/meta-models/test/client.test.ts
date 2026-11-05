// Shared Meta Model API client: auth, base URL, error mapping.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { MetaApiError, createMetaClient } from "../src/client.ts";
import { fakeFetch, jsonResponse } from "./fake-fetch.ts";

describe("createMetaClient", () => {
  it("sends the bearer key and JSON to the Meta base URL", async () => {
    const fetch = fakeFetch(() => jsonResponse({ ok: true }));
    const client = createMetaClient({ apiKey: "secret", fetch: fetch.fn });

    const result = await client.postJson("/chat/completions", { hello: "world" });

    assert.deepEqual(result, { ok: true });
    const call = fetch.calls[0];
    assert.equal(call?.url, "https://api.meta.ai/v1/chat/completions");
    assert.equal(call?.method, "POST");
    assert.equal(call?.headers.authorization, "Bearer secret");
    assert.equal(call?.headers["content-type"], "application/json");
    assert.deepEqual(call?.json, { hello: "world" });
  });

  it("turns an API error body into a MetaApiError with status and type", async () => {
    const fetch = fakeFetch(() =>
      jsonResponse({ error: { type: "invalid_request_error", message: "bad image" } }, 400),
    );
    const client = createMetaClient({ apiKey: "k", fetch: fetch.fn });

    await assert.rejects(client.postJson("/responses", {}), (error: unknown) => {
      assert.ok(error instanceof MetaApiError);
      assert.equal(error.status, 400);
      assert.equal(error.type, "invalid_request_error");
      assert.match(error.message, /bad image/);
      return true;
    });
  });

  it("gives up on a call that hangs, so one stuck model call cannot silence a chat", async () => {
    // Never answers; only the abort signal ends it.
    const hanging = ((_url: string | URL | Request, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
      })) as typeof fetch;
    const client = createMetaClient({ apiKey: "k", fetch: hanging, timeoutMs: 30 });
    // AbortSignal.timeout does not hold the event loop open (the server does).
    const keepAlive = setTimeout(() => {}, 5000);

    await assert.rejects(client.postJson("/chat/completions", {}), /\/chat\/completions timed out after 30 ms/);
    clearTimeout(keepAlive);
  });

  it("refuses to start without an API key", () => {
    assert.throws(() => createMetaClient({ apiKey: "" }), /MODEL_API_KEY/);
  });
});
