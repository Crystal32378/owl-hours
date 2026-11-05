// Restart recovery. Replies run in memory, one conversation at a time, so a
// deploy or crash can drop a customer's message between storing it and
// Zukki handling it (inbound.ts marks messages.zukki_handled_at when done).
// On boot and every minute, messages from the last 2 hours that were never
// handled are rebuilt into turns and replayed on the conversation's queue.
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { unwrap } from "../services/db-result.ts";
import { errorText, type Logger } from "../whatsapp/inbound.ts";
import type { Turn, TurnContext } from "./types.ts";

// Old enough that the live path has had its chance (a media turn can take
// a few model calls), recent enough that a reply still makes sense.
export const RECOVER_AFTER_MS = 5 * 60_000;
export const RECOVER_WITHIN_MS = 2 * 60 * 60_000;
const BATCH = 50;

const uuid = z.string().uuid();
const unhandledRow = z.object({
  conversation_id: uuid,
  wa_message_id: z.string(),
  kind: z.string(),
  body: z.string().nullable(),
  payload: z.record(z.unknown()).nullable(),
  media_id: uuid.nullable(),
  created_at: z.string(),
  media: z.object({ kind: z.string(), size_bytes: z.number().nullable() }).nullable(),
});
type UnhandledRow = z.infer<typeof unhandledRow>;

export type Unanswered = { ctx: TurnContext; turn: Turn };

export async function findUnanswered(db: SupabaseClient, now: Date): Promise<Unanswered[]> {
  const rows = z.array(unhandledRow).parse(
    unwrap(
      await db
        .from("messages")
        .select("conversation_id, wa_message_id, kind, body, payload, media_id, created_at, media(kind, size_bytes)")
        .eq("sender", "customer")
        .is("zukki_handled_at", null)
        .gte("created_at", new Date(now.getTime() - RECOVER_WITHIN_MS).toISOString())
        .lte("created_at", new Date(now.getTime() - RECOVER_AFTER_MS).toISOString())
        .order("created_at")
        .limit(BATCH),
    ),
  );
  if (rows.length === 0) {
    return [];
  }
  const openBusiness = await openBusinesses(db, [...new Set(rows.map((r) => r.conversation_id))]);
  const found: Unanswered[] = [];
  for (const row of rows) {
    const turn = toTurn(row);
    if (!turn) continue;
    found.push({
      ctx: {
        conversationId: row.conversation_id,
        waMessageId: row.wa_message_id,
        isNewConversation: !(await hasEarlierMessage(db, row)),
        businessId: openBusiness.get(row.conversation_id) ?? null,
      },
      turn,
    });
  }
  return found;
}

function toTurn(row: UnhandledRow): Turn | null {
  switch (row.kind) {
    case "text":
      return { kind: "text", text: row.body ?? "" };
    case "button_reply":
    case "list_reply": {
      const id = typeof row.payload?.id === "string" ? row.payload.id : null;
      return id ? { kind: "button", id, title: typeof row.payload?.title === "string" ? row.payload.title : id } : null;
    }
    case "location":
      return { kind: "location" };
    case "media": {
      const type = row.media?.kind;
      // No size: the download from WhatsApp never finished.
      if (!row.media_id || row.media?.size_bytes == null || (type !== "image" && type !== "video" && type !== "audio")) {
        return { kind: "media_failed" };
      }
      return { kind: "media", mediaId: row.media_id, mediaType: type, caption: row.body };
    }
    default:
      return null;
  }
}

async function hasEarlierMessage(db: SupabaseClient, row: UnhandledRow): Promise<boolean> {
  const earlier = unwrap(
    await db.from("messages").select("id").eq("conversation_id", row.conversation_id).lt("created_at", row.created_at).limit(1),
  );
  return Array.isArray(earlier) && earlier.length > 0;
}

// The business whose accepted offer has the chat open, per conversation.
async function openBusinesses(db: SupabaseClient, conversationIds: string[]): Promise<Map<string, string>> {
  const chats = z
    .array(z.object({ id: uuid, active_handoff_id: z.string().nullable() }))
    .parse(unwrap(await db.from("conversations").select("id, active_handoff_id").in("id", conversationIds)));
  const handoffIds = chats.flatMap((c) => (c.active_handoff_id ? [c.active_handoff_id] : []));
  if (handoffIds.length === 0) {
    return new Map();
  }
  const accepted = z
    .array(z.object({ id: z.string(), tenant_id: uuid }))
    .parse(unwrap(await db.from("handoffs").select("id, tenant_id").in("id", handoffIds).eq("status", "accepted")));
  const tenantByHandoff = new Map(accepted.map((h) => [h.id, h.tenant_id]));
  return new Map(
    chats.flatMap((c) => {
      const tenant = c.active_handoff_id ? tenantByHandoff.get(c.active_handoff_id) : undefined;
      return tenant ? [[c.id, tenant] as const] : [];
    }),
  );
}

export type RecoverDeps = {
  db: SupabaseClient;
  enqueue: (conversationId: string, task: () => Promise<void>) => void;
  // inbound.ts runTurn: Zukki's turn, then the handled mark.
  run: (ctx: TurnContext, turn: Turn) => Promise<void>;
  log: Logger;
  now?: () => Date;
};

// Returns a function that finds and queues unanswered messages. A message
// already queued by an earlier run is not queued again until it finishes.
export function recoverUnanswered(deps: RecoverDeps): () => Promise<number> {
  const inFlight = new Set<string>();
  return async () => {
    const found = await findUnanswered(deps.db, (deps.now ?? (() => new Date()))());
    let queued = 0;
    for (const { ctx, turn } of found) {
      if (inFlight.has(ctx.waMessageId)) continue;
      inFlight.add(ctx.waMessageId);
      queued += 1;
      deps.enqueue(ctx.conversationId, async () => {
        try {
          await deps.run(ctx, turn);
        } finally {
          inFlight.delete(ctx.waMessageId);
        }
      });
    }
    return queued;
  };
}

// On boot, then every intervalMs; one run at a time.
export function startRecoveryLoop(deps: RecoverDeps, intervalMs: number) {
  const recover = recoverUnanswered(deps);
  let running: Promise<void> | null = null;
  const tick = () => {
    if (running) return;
    running = recover()
      .then((queued) => {
        if (queued > 0) deps.log.info(`zukki: replaying ${queued} unanswered message(s)`);
      })
      .catch((error: unknown) => deps.log.error(`zukki: recovery failed: ${errorText(error)}`))
      .finally(() => {
        running = null;
      });
  };
  tick();
  const timer = setInterval(tick, intervalMs);
  timer.unref();
  return {
    tick,
    async stop(): Promise<void> {
      clearInterval(timer);
      await running;
    },
  };
}
