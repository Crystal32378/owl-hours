// The orchestrator's view of one conversation in Supabase (service_role,
// scoped by the conversation id the webhook resolved). Zukki's messages go
// into public.messages as delivery = 'queued'; the outbox sends them.
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { isCategory } from "@owl-hours/shared";
import { unwrap } from "../services/db-result.ts";
import type { ConversationFacts, ConversationStore, HistoryEntry, SafetyStep, Urgency } from "./types.ts";

// Enough to see every step of one conversation.
const FACTS_SCAN = 500;
const SUMMARY_MAX = 2000;
const TITLE_MAX = 120;

const payloadSchema = z.record(z.unknown()).nullable();

const conversationRow = z.object({
  state: z.string(),
  category: z.string().nullable(),
  urgency: z.enum(["now", "today", "week"]).nullable(),
  title: z.string().nullish(),
});

const stepRow = z.object({ sender: z.enum(["customer", "zukki", "owner"]), kind: z.string(), payload: payloadSchema });

const historyRow = z.object({
  sender: z.enum(["customer", "zukki", "owner"]),
  kind: z.string(),
  body: z.string().nullable(),
  payload: payloadSchema,
  wa_message_id: z.string().nullable(),
  media: z.object({ kind: z.string(), transcript: z.string().nullable() }).nullable(),
});

export function createConversationStore(db: SupabaseClient): ConversationStore {
  return {
    async facts(conversationId) {
      const conversation = conversationRow.parse(
        unwrap(await db.from("conversations").select("state, category, urgency, title").eq("id", conversationId).single()),
      );
      const steps = z.array(stepRow).parse(
        unwrap(
          await db
            .from("messages")
            .select("sender, kind, payload")
            .eq("conversation_id", conversationId)
            .order("created_at", { ascending: true })
            .limit(FACTS_SCAN),
        ),
      );
      const locations = z
        .array(z.object({ id: z.string() }))
        .parse(unwrap(await db.from("customer_locations").select("id").eq("conversation_id", conversationId).limit(1)));
      return readFacts(conversation, steps, locations.length > 0);
    },

    async queue(conversationId, message, tenantId = null) {
      unwrap(
        await db.from("messages").insert({
          conversation_id: conversationId,
          tenant_id: tenantId,
          sender: "zukki",
          kind: message.kind,
          body: message.body,
          payload: message.payload ?? null,
          delivery: "queued",
        }),
      );
    },

    async saveNeed(conversationId, need) {
      unwrap(
        await db
          .from("conversations")
          .update({
            category: need.category,
            urgency: need.urgency,
            ...(need.title ? { title: need.title.slice(0, TITLE_MAX) } : {}),
            ...(need.summary ? { summary: need.summary.slice(0, SUMMARY_MAX) } : {}),
          })
          .eq("id", conversationId),
      );
    },

    async history(conversationId, limit, skipWaMessageId) {
      const rows = z.array(historyRow).parse(
        unwrap(
          await db
            .from("messages")
            .select("sender, kind, body, payload, wa_message_id, media(kind, transcript)")
            .eq("conversation_id", conversationId)
            .order("created_at", { ascending: false })
            .limit(limit + 1),
        ),
      );
      return rows
        .filter((row) => !skipWaMessageId || row.wa_message_id !== skipWaMessageId)
        .slice(0, limit)
        .reverse()
        .flatMap((row): HistoryEntry[] => {
          const text = describe(row);
          return text ? [{ from: row.sender, text }] : [];
        });
    },

    async saveTranscript(mediaId, transcript) {
      unwrap(await db.from("media").update({ transcript }).eq("id", mediaId));
    },

    async businessName(tenantId) {
      const row = z
        .object({ name: z.string() })
        .nullable()
        .parse(unwrap(await db.from("tenants").select("name").eq("id", tenantId).maybeSingle()));
      return row?.name ?? null;
    },
  };
}

export function readFacts(
  conversation: z.infer<typeof conversationRow>,
  steps: Array<z.infer<typeof stepRow>>,
  locationSaved: boolean,
): ConversationFacts {
  let safety: SafetyStep = "none";
  let locationAsked = false;
  let hasLocation = locationSaved;
  for (const step of steps) {
    const variant = step.payload?.variant;
    if (step.sender === "zukki" && variant === "safety") safety = "awaiting";
    if (step.sender === "zukki" && variant === "safety_text") safety = "answered";
    if (step.sender === "customer" && step.kind === "button_reply" && String(step.payload?.id ?? "").startsWith("safety_")) {
      safety = "answered";
    }
    if (step.sender === "zukki" && step.kind === "location_request") locationAsked = true;
    if (step.sender === "customer" && step.kind === "location") hasLocation = true;
  }
  return {
    state: conversation.state,
    category: conversation.category && isCategory(conversation.category) ? conversation.category : null,
    urgency: conversation.urgency as Urgency | null,
    safety,
    locationAsked,
    hasLocation,
    hasTitle: Boolean(conversation.title),
  };
}

const MEDIA_NAMES: Record<string, string> = { audio: "voice note", video: "video", image: "photo", document: "file" };

function describe(row: z.infer<typeof historyRow>): string | null {
  if (row.sender !== "customer") return row.body;
  switch (row.kind) {
    case "button_reply":
    case "list_reply":
      return `[tapped "${String(row.payload?.title ?? row.body ?? "")}"]`;
    case "location":
      return "[shared their location]";
    case "media": {
      const name = MEDIA_NAMES[row.media?.kind ?? ""] ?? "file";
      const heard = row.media?.transcript ? `: "${row.media.transcript}"` : "";
      const caption = row.body ? ` with the caption "${row.body}"` : "";
      return `[sent a ${name}${heard}]${caption}`;
    }
    default:
      return row.body;
  }
}
