// Stores what customers send on WhatsApp, then hands each new message to
// Zukki (orchestrator/respond.ts) on the conversation's queue. Every write
// is idempotent on WhatsApp's message id, so Meta's retries are safe: an
// error here makes the webhook answer 500 and Meta tries again later, and
// a retried message is never answered twice.
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { isQuestionTap, type WebhookEvent, type WhatsAppClient } from "@owl-hours/whatsapp";
import { unwrap } from "../services/db-result.ts";
import type { Turn, TurnContext } from "../orchestrator/types.ts";
import * as whatsapp from "../services/whatsapp-service.ts";

export type Logger = Pick<Console, "info" | "warn" | "error">;

export type InboundDeps = {
  db: SupabaseClient;
  client: Pick<WhatsAppClient, "getMedia" | "download">;
  storeMedia: (path: string, bytes: Uint8Array, contentType: string) => Promise<void>;
  // Runs slow work (media download, Zukki's answer) after the webhook has
  // answered, one task at a time per conversation, in arrival order.
  enqueue: (conversationId: string, task: () => Promise<void>) => void;
  // Zukki's turn. Unset: messages are stored and nobody answers.
  respond?: ((ctx: TurnContext, turn: Turn) => Promise<void>) | undefined;
  log: Logger;
};

type Stored = { conversationId: string; isNewConversation: boolean; businessId: string | null };

type MessageEvent = Extract<WebhookEvent, { type: "message" }>;
type MediaContent = Extract<MessageEvent["content"], { kind: "media" }>;

// What the media bucket accepts (supabase/migrations/*_platform.sql).
const MEDIA_EXTENSIONS: Record<string, string> = {
  "video/mp4": "mp4",
  "video/3gpp": "3gp",
  "audio/ogg": "ogg",
  "audio/mpeg": "mp3",
  "audio/aac": "aac",
  "audio/wav": "wav",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

const QUOTE_APPROVE = /^quote_approve:([0-9a-f-]{36})$/;

export async function handleEvents(deps: InboundDeps, events: WebhookEvent[]): Promise<void> {
  for (const event of events) {
    if (event.type === "status") {
      // "sent" is already recorded when the outbox sends.
      if (event.status !== "sent") {
        await whatsapp.recordDeliveryStatus(deps.db, event.waMessageId, event.status);
      }
      continue;
    }
    await handleMessage(deps, event);
  }
}

// Queues Zukki's answer to a message that was stored for the first time.
function answer(deps: InboundDeps, event: MessageEvent, stored: Stored, turn: Turn): void {
  if (!deps.respond) return;
  deps.enqueue(stored.conversationId, () => runTurn(deps, turnContext(event, stored), turn));
}

// Zukki's turn, then the handled mark that restart recovery
// (orchestrator/recover.ts) checks. A turn that throws stays unmarked and
// is replayed later.
export async function runTurn(deps: Pick<InboundDeps, "db" | "respond">, ctx: TurnContext, turn: Turn): Promise<void> {
  if (!deps.respond) return;
  await deps.respond(ctx, turn);
  unwrap(
    await deps.db
      .from("messages")
      .update({ zukki_handled_at: new Date().toISOString() })
      .eq("wa_message_id", ctx.waMessageId)
      .eq("sender", "customer"),
  );
}

function turnContext(event: MessageEvent, stored: Stored): TurnContext {
  return {
    conversationId: stored.conversationId,
    waMessageId: event.waMessageId,
    isNewConversation: stored.isNewConversation,
    businessId: stored.businessId,
  };
}

async function handleMessage(deps: InboundDeps, event: MessageEvent): Promise<void> {
  const who = { waId: event.waId, profileName: event.profileName ?? undefined, receivedAt: event.receivedAt };
  const { content } = event;
  switch (content.kind) {
    case "text": {
      const stored = await whatsapp.recordInbound(deps.db, { ...who, waMessageId: event.waMessageId, kind: "text", text: content.text });
      if (!stored.duplicate) answer(deps, event, stored, { kind: "text", text: content.text });
      return;
    }
    case "button_reply":
    case "list_reply": {
      const stored = await whatsapp.recordInbound(deps.db, {
        ...who,
        waMessageId: event.waMessageId,
        kind: content.kind,
        text: ownerFacingBody(content.id, content.title),
        payload: { id: content.id, title: content.title },
      });
      if (stored.duplicate) return;
      const quoteId = QUOTE_APPROVE.exec(content.id)?.[1];
      if (quoteId) {
        await approveQuote(deps, quoteId, event.waMessageId);
      }
      answer(deps, event, stored, { kind: "button", id: content.id, title: content.title });
      return;
    }
    case "location": {
      const conversation = await whatsapp.resolveConversation(deps.db, who);
      const saved = await whatsapp.saveLocation(deps.db, {
        conversationId: conversation.conversationId,
        waMessageId: event.waMessageId,
        latitude: content.latitude,
        longitude: content.longitude,
        address: content.address ?? undefined,
        receivedAt: event.receivedAt,
      });
      if (!saved.duplicate) answer(deps, event, conversation, { kind: "location" });
      return;
    }
    case "media":
      await handleMedia(deps, event, content);
      return;
    case "unsupported":
      deps.log.info(`whatsapp: skipped ${content.type} message ${event.waMessageId}`);
      return;
  }
}

// The owner reads a question tap as the customer's "I have a question";
// every other tap keeps its button title. The payload keeps the tap.
function ownerFacingBody(id: string, title: string): string {
  return isQuestionTap(id) ? "I have a question" : title;
}

// A business rule saying no (quote superseded, job moved on) is not a reason
// for Meta to retry; log it and carry on.
async function approveQuote(deps: InboundDeps, quoteId: string, waMessageId: string): Promise<void> {
  try {
    await whatsapp.approveQuote(deps.db, quoteId);
  } catch (error) {
    deps.log.warn(`whatsapp: approve for quote ${quoteId} (message ${waMessageId}) not applied: ${errorText(error)}`);
  }
}

async function handleMedia(deps: InboundDeps, event: MessageEvent, content: MediaContent): Promise<void> {
  const mimeType = content.mimeType.split(";")[0]!.trim().toLowerCase();
  const extension = MEDIA_EXTENSIONS[mimeType];
  if (!extension) {
    deps.log.warn(`whatsapp: skipped ${content.mediaType} ${event.waMessageId}, type ${mimeType} is not accepted`);
    return;
  }
  if (await alreadyStored(deps.db, event.waMessageId)) {
    return;
  }
  const conversation = await whatsapp.resolveConversation(deps.db, {
    waId: event.waId,
    profileName: event.profileName ?? undefined,
    receivedAt: event.receivedAt,
  });
  const path = `conversations/${conversation.conversationId}/${randomUUID()}.${extension}`;
  const media = z.object({ id: z.string().uuid() }).parse(
    unwrap(
      await deps.db
        .from("media")
        .insert({
          conversation_id: conversation.conversationId,
          kind: content.mediaType,
          storage_path: path,
          mime_type: mimeType,
          wa_media_id: content.waMediaId,
        })
        .select("id")
        .single(),
    ),
  );
  const recorded = await whatsapp.recordInbound(deps.db, {
    waId: event.waId,
    waMessageId: event.waMessageId,
    kind: "media",
    text: content.caption ?? undefined,
    mediaId: media.id,
    profileName: event.profileName ?? undefined,
    receivedAt: event.receivedAt,
  });
  // resolveConversation above made the conversation, so only it knows
  // whether this is the customer's first message (payload 01).
  const stored = { ...recorded, isNewConversation: conversation.isNewConversation || recorded.isNewConversation };
  if (stored.duplicate) {
    // Lost a race with a retry of the same message; keep the other copy.
    unwrap(await deps.db.from("media").delete().eq("id", media.id));
    return;
  }
  deps.enqueue(stored.conversationId, async () => {
    let turn: Turn = { kind: "media", mediaId: media.id, mediaType: content.mediaType, caption: content.caption ?? null };
    try {
      const info = await deps.client.getMedia(content.waMediaId);
      const bytes = await deps.client.download(info.url);
      await deps.storeMedia(path, bytes, mimeType);
      unwrap(await deps.db.from("media").update({ size_bytes: bytes.byteLength }).eq("id", media.id));
    } catch (error) {
      deps.log.error(`whatsapp: download of media ${media.id} (message ${event.waMessageId}) failed: ${errorText(error)}`);
      turn = { kind: "media_failed" };
    }
    await runTurn(deps, turnContext(event, stored), turn);
  });
}

async function alreadyStored(db: SupabaseClient, waMessageId: string): Promise<boolean> {
  const rows = z
    .array(z.object({ id: z.string() }))
    .parse(unwrap(await db.from("messages").select("id").eq("wa_message_id", waMessageId).limit(1)));
  return rows.length > 0;
}

export function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
