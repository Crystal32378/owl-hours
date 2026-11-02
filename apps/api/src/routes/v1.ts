// /v1: the owner app (/v1/owner, Supabase login) and the WhatsApp side
// (/v1/internal, server key), plus the public Facebook Login callback (/v1/meta). Request and response shapes: docs/API.md.
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ChatChoice, ChatRequest } from "@owl-hours/meta-models";
import type { WhatsAppClient } from "@owl-hours/whatsapp";
import type { Authenticate } from "../http/auth.ts";
import { clientAddress, rateLimit } from "../http/rate-limit.ts";
import { HttpError, errorResponse } from "../http/respond.ts";
import type { MetaDeps } from "../meta/graph.ts";
import type { Unavailable } from "../v1-live.ts";
import type { PipelineDeps } from "../worker/process-message.ts";
import { metaCallbackRoutes } from "./meta-callback.ts";
import { internalRoutes } from "./v1-internal.ts";
import { ownerRoutes } from "./v1-owner.ts";

export type V1Deps = {
  authenticate: Authenticate;
  // service_role client: server-only calls, always scoped by a resolved id.
  serviceDb: SupabaseClient;
  serverKey: string;
  // Muse Spark; absent until model credits are in place.
  chat?: (request: ChatRequest) => Promise<ChatChoice>;
  pipeline?: PipelineDeps;
  // Cloud API client; absent until the WHATSAPP_* settings are filled in.
  whatsapp?: Pick<WhatsAppClient, "send">;
  // Facebook Login and Page / Instagram posting; absent until the META_* settings are filled in.
  meta?: MetaDeps | Unavailable;
  now?: () => number;
};

export const MAX_BODY_BYTES = 64 * 1024;

export function v1Routes(deps: V1Deps): Hono {
  const app = new Hono();
  app.onError((error, c) => errorResponse(c, error));
  app.notFound((c) => errorResponse(c, new HttpError(404, "not_found", "No such endpoint.")));
  app.use(
    "*",
    bodyLimit({
      maxSize: MAX_BODY_BYTES,
      onError: (c) => errorResponse(c, new HttpError(413, "too_large", "Request body is over 64 KB.")),
    }),
  );
  app.use("*", rateLimit({ limit: 600, windowMs: 60_000, key: (c) => `ip:${clientAddress(c)}`, now: deps.now }));
  app.route("/owner", ownerRoutes(deps));
  app.route("/meta", metaCallbackRoutes(deps));
  app.route("/internal", internalRoutes(deps));
  return app;
}

// Mounted when the server is missing configuration: every call says so.
export function v1Unavailable(reason: string): Hono {
  const app = new Hono();
  app.all("*", (c) => errorResponse(c, new HttpError(503, "not_configured", reason)));
  return app;
}
