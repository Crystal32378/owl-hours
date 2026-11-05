// Server-side calls for the WhatsApp integration (service_role). Use them
// in-process from the webhook in apps/api, or over /v1/internal. Every
// function is scoped by an id the server resolved, never by tenant input.
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Category } from "@owl-hours/shared";
import { createSupabaseRepository } from "../db/repository.ts";
import { HttpError } from "../http/respond.ts";
import { unwrap } from "./db-result.ts";
import { notifyOfferOwners } from "./owner-push.ts";
import { suggestedQuote } from "./suggested-quote.ts";

const uuid = z.string().uuid();

// "Ana Lopez Garcia" -> "Ana G.": owners see a first name and initial only.
export function displayNameFromProfile(profileName: string | undefined | null): string | null {
  const words = (profileName ?? "").normalize("NFC").trim().split(/\s+/).filter(Boolean);
  const first = words[0];
  if (!first) {
    return null;
  }
  const last = words.length > 1 ? words[words.length - 1] : undefined;
  const initial = last ? ` ${[...last][0]?.toUpperCase() ?? ""}.` : "";
  return `${first.slice(0, 40)}${initial}`;
}

const toIso = (at: string | undefined) => at ?? new Date().toISOString();

// Intake ------------------------------------------------------------------

const conversationRow = z.object({
  conversation_id: uuid,
  customer_id: uuid,
  is_new: z.boolean(),
  open_tenant_id: uuid.nullable(),
});

export async function resolveConversation(
  db: SupabaseClient,
  input: { waId: string; profileName?: string | undefined; receivedAt?: string | undefined },
) {
  const [row] = z.array(conversationRow).parse(
    unwrap(
      await db.rpc("resolve_inbound_conversation", {
        p_wa_id: input.waId,
        p_profile_name: displayNameFromProfile(input.profileName),
        p_at: toIso(input.receivedAt),
      }),
    ),
  );
  if (!row) {
    throw new Error("resolve_inbound_conversation returned no row");
  }
  return {
    conversationId: row.conversation_id,
    isNewConversation: row.is_new,
    businessChatOpen: row.open_tenant_id !== null,
    businessId: row.open_tenant_id,
  };
}

export type InboundInput = {
  waId: string;
  waMessageId: string;
  kind: "text" | "media" | "button_reply" | "list_reply";
  text?: string | undefined;
  payload?: Record<string, unknown> | undefined;
  mediaId?: string | undefined;
  profileName?: string | undefined;
  receivedAt?: string | undefined;
};

const inboundRow = z.object({
  conversation_id: uuid,
  message_id: uuid.nullable(),
  duplicate: z.boolean(),
  is_new_conversation: z.boolean(),
  open_tenant_id: uuid.nullable(),
});

// Stores one inbound message exactly once. When duplicate is true, Meta
// retried a message we already have: do not reply again.
export async function recordInbound(db: SupabaseClient, input: InboundInput) {
  const [row] = z.array(inboundRow).parse(
    unwrap(
      await db.rpc("record_inbound_message", {
        p_wa_id: input.waId,
        p_wa_message_id: input.waMessageId,
        p_kind: input.kind,
        p_body: input.text ?? null,
        p_payload: input.payload ?? null,
        p_media_id: input.mediaId ?? null,
        p_profile_name: displayNameFromProfile(input.profileName),
        p_at: toIso(input.receivedAt),
      }),
    ),
  );
  if (!row) {
    throw new Error("record_inbound_message returned no row");
  }
  return {
    conversationId: row.conversation_id,
    messageId: row.message_id,
    duplicate: row.duplicate,
    isNewConversation: row.is_new_conversation,
    businessChatOpen: row.open_tenant_id !== null,
    businessId: row.open_tenant_id,
  };
}

export async function saveLocation(
  db: SupabaseClient,
  input: {
    conversationId: string;
    waMessageId: string;
    latitude: number;
    longitude: number;
    address?: string | undefined;
    receivedAt?: string | undefined;
  },
) {
  const [row] = z
    .array(z.object({ message_id: uuid, customer_location_id: uuid, duplicate: z.boolean() }))
    .parse(
      unwrap(
        await db.rpc("save_customer_location", {
          p_conversation_id: input.conversationId,
          p_wa_message_id: input.waMessageId,
          p_latitude: input.latitude,
          p_longitude: input.longitude,
          p_address: input.address ?? null,
          p_at: toIso(input.receivedAt),
        }),
      ),
    );
  if (!row) {
    throw new Error("save_customer_location returned no row");
  }
  return { messageId: row.message_id, customerLocationId: row.customer_location_id, duplicate: row.duplicate };
}

// Matching ----------------------------------------------------------------

const priceRows = z.array(
  z.object({
    tenant_id: uuid,
    item: z.string(),
    kind: z.string(),
    min_amount: z.number(),
    max_amount: z.number(),
    currency: z.string(),
    conditions: z.string().nullable(),
  }),
);

// Everything payload 07 (the suggestion card) shows, closest business first.
export async function findMatches(
  db: SupabaseClient,
  input: { conversationId: string; category: Category; exclude?: string[] | undefined },
) {
  const matches = await createSupabaseRepository(db).searchDirectory({
    conversationId: input.conversationId,
    category: input.category,
    exclude: input.exclude ?? [],
  });
  if (matches.length === 0) {
    return [];
  }
  const prices = priceRows.parse(
    unwrap(
      await db
        .from("price_rules")
        .select("tenant_id, item, kind, min_amount, max_amount, currency, conditions")
        .in("tenant_id", matches.map((m) => m.tenantId)),
    ),
  );
  return matches.map((match) => {
    const own = prices.filter((p) => p.tenant_id === match.tenantId);
    const visit = own.find((p) => p.kind === "callout");
    const night = own.find((p) => p.kind === "night_fee");
    const repairs = own.filter((p) => p.kind === "repair_range");
    const cheapest = repairs.reduce<(typeof repairs)[number] | null>((best, r) => (!best || r.min_amount < best.min_amount ? r : best), null);
    return {
      businessId: match.tenantId,
      name: match.name,
      shortName: match.shortName,
      rating: match.rating,
      reviews: match.reviewCount,
      distanceKm: match.distanceKm,
      etaMinutes: match.etaMinutes,
      openNow: match.openNow,
      takesNightJobs: match.nightJobs,
      currency: visit?.currency ?? own[0]?.currency ?? "USD",
      visit: visit?.min_amount ?? null,
      nightFee: night ? { amount: night.min_amount, window: night.conditions } : null,
      repairFrom: cheapest?.min_amount ?? null,
      // "Leak repair: from $60" on the card: the business's own name for it.
      repairLabel: cheapest?.item ?? null,
    };
  });
}

// The range Zukki suggests on the offer, from the business's price rules at
// its own local hour (suggested-quote.ts).
export async function suggestedQuoteFor(db: SupabaseClient, businessId: string, now: Date) {
  const tenant = z.object({ timezone: z.string() }).parse(
    unwrap(await db.from("tenants").select("timezone").eq("id", businessId).single()),
  );
  const rules = z
    .array(z.object({ item: z.string(), kind: z.string(), min_amount: z.number(), max_amount: z.number(), conditions: z.string().nullable() }))
    .parse(unwrap(await db.from("price_rules").select("item, kind, min_amount, max_amount, conditions").eq("tenant_id", businessId)));
  const localHour = Number(new Intl.DateTimeFormat("en-US", { hour: "numeric", hourCycle: "h23", timeZone: tenant.timezone }).format(now));
  return suggestedQuote(rules, localHour);
}

// "Connect me": offers the request to the business and starts its timer.
// The owner push goes out best-effort after the offer stands: a push failure
// is logged and never blocks or rolls back the offer (S11).
export async function connectBusiness(
  db: SupabaseClient,
  input: { conversationId: string; businessId: string; suggestedMin?: number | undefined; suggestedMax?: number | undefined },
  deps?: { push?: typeof fetch | undefined },
) {
  const row = z
    .object({ id: uuid, attempt: z.number(), expires_at: z.string(), distance_km: z.coerce.number().nullable() })
    .parse(
      unwrap(
        await db.rpc("create_handoff", {
          p_conversation_id: input.conversationId,
          p_tenant_id: input.businessId,
          p_suggested_min: input.suggestedMin ?? null,
          p_suggested_max: input.suggestedMax ?? null,
        }),
      ),
    );
  const offer = { offerId: row.id, attempt: row.attempt, expiresAt: row.expires_at, distanceKm: row.distance_km };
  await notifyOfferOwners(
    db,
    deps?.push ?? fetch,
    { conversationId: input.conversationId, businessId: input.businessId, offerId: offer.offerId, distanceKm: offer.distanceKm },
  )
    .then((summary) => {
      if (summary.failed > 0) {
        console.warn(
          `[api] offer ${offer.offerId} push failed: sent=${summary.sent} failed=${summary.failed} removed=${summary.removed.length}, the offer stands`,
        );
      }
    })
    .catch((error: unknown) => {
      console.warn(`[api] offer ${offer.offerId} push failed, the offer stands:`, error);
    });
  return offer;
}

// "Approve visit" (quote_approve:<id>).
export async function approveQuote(db: SupabaseClient, quoteId: string) {
  const row = z
    .object({ id: uuid, job_id: uuid, status: z.string() })
    .parse(unwrap(await db.rpc("approve_quote", { p_quote_id: quoteId })));
  return { quoteId: row.id, jobId: row.job_id, status: row.status };
}

// Outbox ------------------------------------------------------------------

export async function claimOutbox(db: SupabaseClient, limit = 20) {
  return z.array(z.record(z.unknown())).parse(unwrap(await db.rpc("claim_outbox", { p_limit: limit })));
}

// retry: the send failed in a way that may pass (busy, down, no answer);
// the database queues it again with backoff, up to 5 tries.
export async function recordOutboundResult(db: SupabaseClient, messageId: string, waMessageId: string | null, retry = false) {
  const row = z
    .object({ id: uuid, delivery: z.string(), wa_message_id: z.string().nullable() })
    .parse(
      unwrap(
        await db.rpc("record_outbound_result", { p_message_id: messageId, p_wa_message_id: waMessageId, p_retry: retry }),
      ),
    );
  return { id: row.id, status: row.delivery, waMessageId: row.wa_message_id };
}

export async function recordDeliveryStatus(
  db: SupabaseClient,
  waMessageId: string,
  status: "delivered" | "read" | "failed",
) {
  const updated = z
    .boolean()
    .parse(unwrap(await db.rpc("record_delivery_status", { p_wa_message_id: waMessageId, p_status: status })));
  return { updated };
}

export function requirePipeline<T>(pipeline: T | undefined): T {
  if (!pipeline) {
    throw new HttpError(503, "model_unavailable", "Zukki's models are not connected yet.");
  }
  return pipeline;
}
