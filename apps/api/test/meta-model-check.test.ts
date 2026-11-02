// Startup check of what this deployment's key can use: a 404 model_not_found from Meta means the
// key's team lacks the model, and the host's variables cannot be read from outside.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { logMetaModelAccess } from "../src/meta-model-check.ts";

const KEY = "secret-key-value-0123456789";
const env = { META_MODEL_API_KEY: KEY };
const ALL = ["muse-spark-1.3", "sam-3.1", "muse-voice-transcribe-1.0", "muse-image-1.0"];

function setup(answer: () => Promise<Response>) {
  const lines: string[] = [];
  const requests: { url: string; authorization: string | null }[] = [];
  const log = { log: (line: string) => lines.push(line), warn: (line: string) => lines.push(line) };
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    requests.push({ url: String(url), authorization: new Headers(init?.headers).get("authorization") });
    return answer();
  }) as typeof fetch;
  return { lines, requests, run: (e: Record<string, string | undefined> = env) => logMetaModelAccess(e, log, fetchImpl) };
}

const listing = (ids: string[]) => async () => Response.json({ data: ids.map((id) => ({ id })) });

describe("logMetaModelAccess", () => {
  it("says the models are replayed, and sends the key nowhere, when a local model URL is set", async () => {
    const { lines, requests, run } = setup(listing(ALL));

    await run({ ...env, META_MODEL_BASE_URL: "http://127.0.0.1:4011/v1" });

    assert.deepEqual(requests, []);
    assert.match(lines.join("\n"), /not calling Meta.*http:\/\/127\.0\.0\.1:4011\/v1/);
  });

  it("asks Meta which models this key sees and logs them", async () => {
    const { lines, requests, run } = setup(listing(ALL));

    await run();

    assert.deepEqual(requests, [{ url: "https://api.meta.ai/v1/models", authorization: `Bearer ${KEY}` }]);
    assert.match(lines.join("\n"), /key length 27/);
    assert.match(lines.join("\n"), /muse-spark-1\.3/);
    assert.doesNotMatch(lines.join("\n"), /missing/);
  });

  it("names the models the API needs and this key cannot see", async () => {
    const { lines, run } = setup(listing(["muse-image-1.0"]));

    await run();

    assert.match(lines.join("\n"), /missing.*muse-spark-1\.3.*sam-3\.1.*muse-voice-transcribe-1\.0/);
  });

  it("logs a fingerprint to compare keys, never the key", async () => {
    const { lines, run } = setup(listing(ALL));

    await run();

    assert.match(lines.join("\n"), /fingerprint [0-9a-f]{8}\b/);
    assert.doesNotMatch(lines.join("\n"), new RegExp(KEY));
  });

  it("logs Meta's refusal and does not throw", async () => {
    const { lines, run } = setup(async () => Response.json({ error: { message: "bad key" } }, { status: 401 }));

    await run();

    assert.match(lines.join("\n"), /HTTP 401/);
  });

  it("logs a failed request and does not throw, so it never stops the API", async () => {
    const { lines, run } = setup(async () => {
      throw new Error("network down");
    });

    await run();

    assert.match(lines.join("\n"), /could not list models: Error/);
  });

  it("never logs the key from a request error, as when a bad paste makes the header invalid", async () => {
    const { lines, run } = setup(async () => {
      throw new TypeError(`Bearer ${KEY}\n is not a legal HTTP header value`);
    });

    await run();

    assert.doesNotMatch(lines.join("\n"), new RegExp(KEY));
    assert.match(lines.join("\n"), /could not list models/);
  });

  it("flags a key with spaces or line breaks, which a bad paste leaves behind", async () => {
    const { lines, run } = setup(listing(ALL));

    await run({ META_MODEL_API_KEY: `${KEY}\n` });

    assert.match(lines.join("\n"), /has spaces or line breaks/);
    assert.doesNotMatch(lines.join("\n"), new RegExp(KEY));
  });

  it("gives the network cause, which is where fetch keeps it", async () => {
    const { lines, run } = setup(async () => {
      throw new TypeError("fetch failed", { cause: Object.assign(new Error("connect failed"), { code: "ECONNREFUSED" }) });
    });

    await run();

    assert.match(lines.join("\n"), /ECONNREFUSED/);
  });

  it("says nothing and asks nothing without a key", async () => {
    const { lines, requests, run } = setup(listing(ALL));

    await run({});

    assert.deepEqual([lines, requests], [[], []]);
  });
});
