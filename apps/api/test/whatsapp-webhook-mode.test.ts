// Receive-only mode must verify Meta requests and discard them without
// constructing model, database, WhatsApp sender or background-loop clients.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { createApp } from "../src/index.ts";
import { loadRuntimeDeps } from "../src/v1-live.ts";

const VERIFY_TOKEN = "receive-only-verify-token-test";
const APP_SECRET = "receive-only-app-secret-test";
const quiet = { info: () => {}, warn: () => {}, error: () => {} };

const sign = (raw: string) =>
  `sha256=${createHmac("sha256", APP_SECRET).update(raw).digest("hex")}`;

const eventBody = JSON.stringify({
  object: "whatsapp_business_account",
  entry: [{
    id: "test-waba",
    changes: [{
      field: "messages",
      value: {
        contacts: [{ wa_id: "15550001111", profile: { name: "Synthetic Test" } }],
        messages: [{
          from: "15550001111",
          id: "wamid.synthetic-test",
          timestamp: "1761696000",
          type: "text",
          text: { body: "synthetic webhook event" },
        }],
      },
    }],
  }],
});

function setup() {
  const logEntries: string[] = [];
  const log = {
    info: (message: string) => logEntries.push(message),
    warn: (message: string) => logEntries.push(message),
    error: (message: string) => logEntries.push(message),
  };
  const live = loadRuntimeDeps({
    WHATSAPP_WEBHOOK_MODE: "receive-only",
    WHATSAPP_VERIFY_TOKEN: VERIFY_TOKEN,
    META_APP_SECRET: APP_SECRET,
  }, log);
  const { app } = createApp({ v1: live.v1, whatsapp: live.whatsapp });
  return { app, live, logEntries };
}

describe("WhatsApp webhook receive-only mode", () => {
  it("answers the verification challenge without live service credentials", async () => {
    const { app, live } = setup();
    const response = await app.request(
      `/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=${VERIFY_TOKEN}&hub.challenge=local-challenge`,
    );

    assert.equal(response.status, 200);
    assert.equal(await response.text(), "local-challenge");
    assert.equal("unavailable" in live.v1, true);
    assert.equal(live.outbox, null);
    assert.equal(live.notices, null);
    assert.equal(live.recovery, null);
  });

  it("acknowledges a valid signed event and discards its contents", async () => {
    const { app, logEntries } = setup();
    const response = await app.request("/webhooks/whatsapp", {
      method: "POST",
      body: eventBody,
      headers: {
        "content-type": "application/json",
        "x-hub-signature-256": sign(eventBody),
      },
    });

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { received: 1 });
    assert.equal(logEntries.some((message) => /15550001111|Synthetic Test|synthetic webhook event/.test(message)), false);
  });

  it("rejects an invalid signature before acknowledging an event", async () => {
    const { app } = setup();
    const response = await app.request("/webhooks/whatsapp", {
      method: "POST",
      body: eventBody,
      headers: {
        "content-type": "application/json",
        "x-hub-signature-256": "sha256=invalid",
      },
    });

    assert.equal(response.status, 401);
  });

  it("fails closed for unsupported webhook modes", () => {
    assert.throws(
      () => loadRuntimeDeps({ WHATSAPP_WEBHOOK_MODE: "send-replies" }, quiet),
      /WHATSAPP_WEBHOOK_MODE/,
    );
  });
});
