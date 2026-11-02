// WhatsApp Cloud API webhook (Meta app > WhatsApp > Configuration).
// GET answers Meta's verification with hub.challenge when hub.verify_token
// matches WHATSAPP_VERIFY_TOKEN. POST checks X-Hub-Signature-256 against
// META_APP_SECRET over the raw body, passes events to the configured handler,
// then answers 200. The normal handler stores them before the answer; an
// explicitly selected receive-only handler may acknowledge and discard them.
import { createHash, timingSafeEqual } from "node:crypto";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { SIGNATURE_HEADER, parseWebhook, verifySignature, type WebhookEvent } from "@owl-hours/whatsapp";
import type { Logger } from "../whatsapp/inbound.ts";

export type WebhookDeps = {
  verifyToken: string;
  appSecret: string;
  handle: (events: WebhookEvent[]) => Promise<void>;
  log: Logger;
};

const MAX_WEBHOOK_BYTES = 1024 * 1024;
const digest = (value: string) => createHash("sha256").update(value).digest();

export function whatsappRoutes(deps: WebhookDeps): Hono {
  const routes = new Hono();
  const expectedToken = digest(deps.verifyToken);

  routes.get("/", (c) => {
    const mode = c.req.query("hub.mode");
    const token = c.req.query("hub.verify_token");
    const challenge = c.req.query("hub.challenge") ?? "";
    const ok = mode === "subscribe" && token !== undefined && timingSafeEqual(digest(token), expectedToken);
    return ok ? c.text(challenge) : c.json({ error: "forbidden" }, 403);
  });

  routes.post(
    "/",
    bodyLimit({ maxSize: MAX_WEBHOOK_BYTES, onError: (c) => c.json({ error: "too_large" }, 413) }),
    async (c) => {
      const raw = await c.req.text();
      if (!verifySignature(deps.appSecret, raw, c.req.header(SIGNATURE_HEADER))) {
        return c.json({ error: "bad_signature" }, 401);
      }
      let body: unknown;
      try {
        body = JSON.parse(raw);
      } catch {
        return c.json({ error: "bad_json" }, 400);
      }
      const { events, skipped } = parseWebhook(body);
      if (skipped > 0) {
        deps.log.warn(`whatsapp: webhook had ${skipped} entries we could not read`);
      }
      try {
        await deps.handle(events);
      } catch (error) {
        deps.log.error("whatsapp: webhook processing failed, Meta will retry", error);
        return c.json({ error: "processing_failed" }, 500);
      }
      return c.json({ received: events.length });
    },
  );

  return routes;
}

// Mounted when WhatsApp settings are missing.
export function whatsappUnavailable(reason: string): Hono {
  const routes = new Hono();
  routes.all("*", (c) => c.json({ error: "not_configured", message: reason }, 503));
  return routes;
}
