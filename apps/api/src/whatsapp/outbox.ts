// Sends queued owner and Zukki messages through the Cloud API, in the
// formats of @owl-hours/whatsapp (Zukki's 01-10, 13-15; owner 11 as
// written, 12 polished).
// claim_outbox marks each row sent; the result is then recorded with
// WhatsApp's id, or as failed.
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import {
  INTERACTIVE_BODY_MAX,
  buttonMessage,
  locationRequestMessage,
  ownerMessageAsWritten,
  ownerMessagePolished,
  textMessage,
  whatAreYouLookingFor,
  WhatsAppApiError,
  type OutgoingMessage,
  type WhatsAppClient,
} from "@owl-hours/whatsapp";
import { unwrap } from "../services/db-result.ts";
import * as whatsapp from "../services/whatsapp-service.ts";
import { errorText, type Logger } from "./inbound.ts";

// What orchestrator/copy.ts queues into payload for a button card: the
// content the builders produced (body, buttons, header, footer) plus the row
// extras the wire format has no room for (business_id, quote_id, notice).
// Old rows keep rendering because the shape is unchanged (T2 S5).
const zukkiCard = z.object({
  buttons: z.array(z.object({ id: z.string().min(1).max(256), title: z.string().min(1).max(20) })).min(1).max(3),
  header_text: z.string().min(1).max(60).optional(),
  header_image_url: z.string().url().optional(),
  footer: z.string().min(1).max(60).optional(),
});

const outboxRow = z.object({
  id: z.string().uuid(),
  conversationId: z.string().uuid(),
  waId: z.string().regex(/^[0-9]{6,20}$/),
  sender: z.enum(["zukki", "owner"]),
  kind: z.string(),
  body: z.string().nullable(),
  payload: z.record(z.unknown()).nullable(),
  businessName: z.string().nullable(),
  businessShortName: z.string().nullable(),
});
export type OutboxRow = z.infer<typeof outboxRow>;

export type OutboxDeps = {
  db: SupabaseClient;
  client: Pick<WhatsAppClient, "send">;
  log: Logger;
};

// null: a kind this sender does not handle yet (it is marked failed).
export function renderOutbound(row: OutboxRow, senderFirstName: string | null): OutgoingMessage | null {
  if (!row.body) {
    return null;
  }
  if (row.sender === "zukki") {
    return renderZukki(row, row.body);
  }
  if (row.kind === "text") {
    return ownerMessageAsWritten({ to: row.waId, businessName: row.businessName, senderFirstName, ownerText: row.body });
  }
  if (row.kind === "interactive" && row.payload?.variant === "polished_reply") {
    return ownerMessagePolished({
      to: row.waId,
      businessName: row.businessName,
      senderFirstName,
      polishedText: row.body,
      businessShortName: row.businessShortName,
    });
  }
  return null;
}

function renderZukki(row: OutboxRow, body: string): OutgoingMessage | null {
  if (row.kind === "text") return textMessage(row.waId, body);
  if (row.kind === "location_request") return locationRequestMessage(row.waId, body);
  if (row.kind !== "interactive") return null;
  if (row.payload?.variant === "category_list") {
    return whatAreYouLookingFor({ to: row.waId });
  }
  const card = zukkiCard.safeParse(row.payload ?? {});
  if (!card.success || body.length > INTERACTIVE_BODY_MAX) return null;
  return buttonMessage(row.waId, {
    body,
    buttons: card.data.buttons,
    footer: card.data.footer,
    headerText: card.data.header_text,
    headerImageUrl: card.data.header_image_url,
  });
}

export async function drainOutbox(deps: OutboxDeps, limit = 20): Promise<{ sent: number; failed: number }> {
  const rows = z.array(outboxRow).parse(await whatsapp.claimOutbox(deps.db, limit));
  if (rows.length === 0) {
    return { sent: 0, failed: 0 };
  }
  const names = await senderFirstNames(deps.db, rows);
  let sent = 0;
  let failed = 0;
  for (const row of rows) {
    const message = renderOutbound(row, names.get(row.id) ?? null);
    let waMessageId: string | null = null;
    let retry = false;
    if (!message) {
      deps.log.warn(`whatsapp: outbox message ${row.id} (${row.sender} ${row.kind}) has no WhatsApp format yet`);
    } else {
      try {
        waMessageId = await deps.client.send(message);
      } catch (error) {
        retry = mayPass(error);
        deps.log.error(`whatsapp: send of outbox message ${row.id} failed${retry ? " (will retry)" : ""}: ${errorText(error)}`);
      }
    }
    await whatsapp.recordOutboundResult(deps.db, row.id, waMessageId, retry);
    if (waMessageId) sent += 1;
    else failed += 1;
  }
  return { sent, failed };
}

// Failures worth another try: rate limits, Meta outages, timeouts and
// network errors. A 4xx (bad number, 24 h window closed) will not pass.
export function mayPass(error: unknown): boolean {
  if (error instanceof WhatsAppApiError) {
    return error.status === 429 || error.status >= 500;
  }
  if (error instanceof Error) {
    return error.name === "TimeoutError" || error.name === "AbortError" || error instanceof TypeError;
  }
  return false;
}

// Owner messages are signed with the author's first name (payload 11/12).
async function senderFirstNames(db: SupabaseClient, rows: OutboxRow[]): Promise<Map<string, string>> {
  const ownerIds = rows.filter((r) => r.sender === "owner").map((r) => r.id);
  if (ownerIds.length === 0) {
    return new Map();
  }
  const authors = z
    .array(z.object({ id: z.string(), tenant_id: z.string().nullable(), author_user_id: z.string().nullable() }))
    .parse(unwrap(await db.from("messages").select("id, tenant_id, author_user_id").in("id", ownerIds)));
  const userIds = [...new Set(authors.flatMap((a) => (a.author_user_id ? [a.author_user_id] : [])))];
  if (userIds.length === 0) {
    return new Map();
  }
  const people = z
    .array(z.object({ tenant_id: z.string(), user_id: z.string(), display_name: z.string() }))
    .parse(unwrap(await db.from("tenant_users").select("tenant_id, user_id, display_name").in("user_id", userIds)));
  const names = new Map<string, string>();
  for (const author of authors) {
    const person = people.find((p) => p.user_id === author.author_user_id && p.tenant_id === author.tenant_id);
    const first = person?.display_name.trim().split(/\s+/)[0];
    if (first) names.set(author.id, first);
  }
  return names;
}
