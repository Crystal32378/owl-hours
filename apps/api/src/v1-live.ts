// Real dependencies from the environment (apps/api/.env.example). A missing
// group of settings turns that part off with a reason that names the
// variables, never their values.
import type { SupabaseClient } from "@supabase/supabase-js";
import { createChatCompletion, createMetaClient } from "@owl-hours/meta-models";
import { createWhatsAppClient, type WhatsAppClient } from "@owl-hours/whatsapp";
import { loadConfig, loadMetaConfig, loadWhatsAppConfig, loadWebhookReceiveOnlyConfig, type ApiConfig, type WhatsAppConfig } from "./config.ts";
import { createServiceClient } from "./db/client.ts";
import { createSupabaseAuthenticator } from "./http/auth.ts";
import type { MetaDeps } from "./meta/graph.ts";
import type { V1Deps } from "./routes/v1.ts";
import type { WebhookDeps } from "./routes/whatsapp.ts";
import { createRespondDeps } from "./orchestrator/live.ts";
import type { NoticeDeps } from "./orchestrator/notices.ts";
import { respond } from "./orchestrator/respond.ts";
import { createSerializer } from "./orchestrator/serial.ts";
import type { RecoverDeps } from "./orchestrator/recover.ts";
import { handleEvents, runTurn, type Logger } from "./whatsapp/inbound.ts";
import type { OutboxDeps } from "./whatsapp/outbox.ts";
import { createLiveDeps } from "./worker/live-deps.ts";

export type Unavailable = { unavailable: string };
export type LiveDeps = {
  v1: V1Deps | Unavailable;
  whatsapp: WebhookDeps | Unavailable;
  // Set when both the database and WhatsApp are configured.
  outbox: OutboxDeps | null;
  notices: NoticeDeps | null;
  // Replays messages a restart dropped (set with notices).
  recovery: RecoverDeps | null;
};

export function createLiveV1Deps(config: ApiConfig = loadConfig(), whatsapp?: WhatsAppClient): V1Deps {
  const meta = createMetaClient({ apiKey: config.metaModelApiKey });
  return {
    authenticate: createSupabaseAuthenticator(config),
    serviceDb: createServiceClient(config),
    serverKey: config.serverKey,
    chat: (request) => createChatCompletion(meta, request),
    pipeline: createLiveDeps(config),
    ...(whatsapp ? { whatsapp } : {}),
  };
}

export function loadLiveDeps(env: Record<string, string | undefined> = process.env, log: Logger = console): LiveDeps {
  let config: ApiConfig;
  try {
    config = loadConfig(env);
  } catch (error) {
    const reason = reasonOf(error);
    return { v1: { unavailable: reason }, whatsapp: { unavailable: reason }, outbox: null, notices: null, recovery: null };
  }
  let waConfig: WhatsAppConfig | null = null;
  let waReason = "";
  try {
    waConfig = loadWhatsAppConfig(env);
  } catch (error) {
    waReason = reasonOf(error);
  }
  const client = waConfig
    ? createWhatsAppClient({ accessToken: waConfig.accessToken, phoneNumberId: waConfig.phoneNumberId, graphVersion: waConfig.graphVersion })
    : undefined;
  const v1 = { ...createLiveV1Deps(config, client), meta: loadMetaDeps(env) };
  if (!waConfig || !client) {
    return { v1, whatsapp: { unavailable: waReason }, outbox: null, notices: null, recovery: null };
  }
  const zukki =
    v1.chat && v1.pipeline
      ? createRespondDeps({ db: v1.serviceDb, chat: v1.chat, pipeline: v1.pipeline, whatsapp: client, log })
      : null;
  const serial = createSerializer(log);
  const respondTo = zukki ? (ctx: Parameters<typeof respond>[1], turn: Parameters<typeof respond>[2]) => respond(zukki, ctx, turn) : undefined;
  const enqueue = (conversationId: string, task: () => Promise<void>) => void serial(conversationId, task);
  return {
    v1,
    whatsapp: {
      verifyToken: waConfig.verifyToken,
      appSecret: waConfig.appSecret,
      handle: (events) =>
        handleEvents(
          {
            db: v1.serviceDb,
            client,
            storeMedia: (path, bytes, contentType) => uploadMedia(v1.serviceDb, path, bytes, contentType),
            enqueue,
            respond: respondTo,
            log,
          },
          events,
        ),
      log,
    },
    outbox: { db: v1.serviceDb, client, log },
    notices: zukki ? { db: v1.serviceDb, store: zukki.store, directory: zukki.directory, log } : null,
    recovery: respondTo
      ? { db: v1.serviceDb, enqueue, run: (ctx, turn) => runTurn({ db: v1.serviceDb, respond: respondTo }, ctx, turn), log }
      : null,
  };
}

// Explicitly bypass every live dependency in receive-only mode. The webhook
// verifies Meta's requests, reports only the accepted event count, then drops
// the event contents without storing them or scheduling replies.
export function loadRuntimeDeps(env: Record<string, string | undefined> = process.env, log: Logger = console): LiveDeps {
  const mode = env.WHATSAPP_WEBHOOK_MODE;
  if (mode === undefined || mode === "") return loadLiveDeps(env, log);
  if (mode !== "receive-only") {
    throw new Error("WHATSAPP_WEBHOOK_MODE must be unset or receive-only");
  }

  const config = loadWebhookReceiveOnlyConfig(env);
  log.warn("WhatsApp webhook receive-only mode enabled; valid events are acknowledged and discarded");
  return {
    v1: { unavailable: "Disabled by WHATSAPP_WEBHOOK_MODE=receive-only" },
    whatsapp: {
      verifyToken: config.verifyToken,
      appSecret: config.appSecret,
      handle: async (events) => {
        log.info(`whatsapp receive-only: discarded ${events.length} event(s)`);
      },
      log,
    },
    outbox: null,
    notices: null,
    recovery: null,
  };
}

// Facebook Login and posting stay off, with the reason, until META_* is complete.
function loadMetaDeps(env: Record<string, string | undefined>): MetaDeps | Unavailable {
  try {
    return { config: loadMetaConfig(env) };
  } catch (error) {
    return { unavailable: reasonOf(error) };
  }
}

async function uploadMedia(db: SupabaseClient, path: string, bytes: Uint8Array, contentType: string): Promise<void> {
  const { error } = await db.storage.from("media").upload(path, bytes, { contentType, upsert: false });
  if (error) {
    throw new Error(`upload failed: ${error.message}`);
  }
}

function reasonOf(error: unknown): string {
  return error instanceof Error ? error.message : "not configured";
}
