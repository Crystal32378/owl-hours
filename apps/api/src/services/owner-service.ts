// Owner app data. Every call runs with the owner's own token, so row-level
// security is the tenant boundary; nothing here filters by tenant by hand.
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import {
  storySlidesSchema,
  storyPackMediaRevisionSchema,
  type StoryPackReview,
  type StoryPackCreate,
  type StoryPackUpdate,
  type StoryPackDraftDto,
  type StoryPackSourceDto,
  type StoryPackHandoffDto,
} from "@owl-hours/shared";
import type { ChatChoice, ChatRequest, QuoteLine } from "./owner-types.ts";
import { RepositoryError, createSupabaseRepository } from "../db/repository.ts";
import type { OwnerSession } from "../http/auth.ts";
import { HttpError } from "../http/respond.ts";
import { askTestZukki } from "../agent/test-zukki.ts";
import { unwrap } from "./db-result.ts";
import { polishOwnerMessage } from "./polish.ts";

export const SIGNED_MEDIA_SECONDS = 600;

type Item = Record<string, unknown>;
const items = z.array(z.record(z.unknown()));
const uuid = z.string().uuid();

const handoffRow = z.object({
  id: uuid,
  status: z.string(),
  expires_at: z.string(),
  resolved_at: z.string().nullable(),
  decline_reason: z.string().nullable().optional(),
});

function toOffer(row: z.infer<typeof handoffRow>) {
  return {
    id: row.id,
    status: row.status,
    expiresAt: row.expires_at,
    resolvedAt: row.resolved_at,
    declineReason: row.decline_reason ?? null,
  };
}

// Media ---------------------------------------------------------------------

function mediaObjects(value: unknown): Item[] {
  if (Array.isArray(value)) {
    return value.filter((entry): entry is Item => typeof entry === "object" && entry !== null);
  }
  return typeof value === "object" && value !== null ? [value as Item] : [];
}

async function signPaths(db: SupabaseClient, paths: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(paths)];
  if (unique.length === 0) {
    return new Map();
  }
  const { data, error } = await db.storage.from("media").createSignedUrls(unique, SIGNED_MEDIA_SECONDS);
  if (error) {
    throw new RepositoryError(`could not sign media links: ${error.message}`, null);
  }
  return new Map(
    (data ?? []).flatMap((entry) =>
      entry.path && entry.signedUrl && !entry.error ? [[entry.path, entry.signedUrl] as const] : [],
    ),
  );
}

// Swaps storage paths for short-lived signed links (storage RLS applies).
async function withMediaLinks(db: SupabaseClient, list: Item[], key: string): Promise<Item[]> {
  const paths = list.flatMap((item) =>
    mediaObjects(item[key]).flatMap((media) =>
      [media.storagePath, media.thumbPath].filter((path): path is string => typeof path === "string"),
    ),
  );
  const links = await signPaths(db, paths);
  const convert = (media: Item): Item => {
    const { storagePath, thumbPath, ...rest } = media;
    return {
      ...rest,
      url: typeof storagePath === "string" ? (links.get(storagePath) ?? null) : null,
      thumbUrl: typeof thumbPath === "string" ? (links.get(thumbPath) ?? null) : null,
    };
  };
  return list.map((item) => {
    const value = item[key];
    if (Array.isArray(value)) {
      return { ...item, [key]: mediaObjects(value).map(convert) };
    }
    return { ...item, [key]: typeof value === "object" && value !== null ? convert(value as Item) : null };
  });
}

// Account -------------------------------------------------------------------

const membershipRows = z.array(
  z.object({ tenant_id: uuid, role: z.enum(["owner", "staff"]), display_name: z.string() }),
);
const tenantRows = z.array(
  z.object({ id: uuid, name: z.string(), short_name: z.string(), category: z.string(), accepts_now: z.boolean() }),
);

export async function getMe(s: OwnerSession) {
  const memberships = membershipRows.parse(
    unwrap(
      await s.db
        .from("tenant_users")
        .select("tenant_id, role, display_name")
        .eq("user_id", s.userId)
        // The business routes edit the first membership in this same order.
        .order("created_at")
        .order("tenant_id"),
    ),
  );
  const ids = memberships.map((m) => m.tenant_id);
  const tenants =
    ids.length === 0
      ? []
      : tenantRows.parse(
          unwrap(await s.db.from("tenants").select("id, name, short_name, category, accepts_now").in("id", ids)),
        );
  const byId = new Map(tenants.map((t) => [t.id, t]));
  return {
    userId: s.userId,
    businesses: memberships.flatMap((m) => {
      const tenant = byId.get(m.tenant_id);
      return tenant
        ? [{
            id: tenant.id,
            name: tenant.name,
            shortName: tenant.short_name,
            category: tenant.category,
            takingRequests: tenant.accepts_now,
            role: m.role,
            displayName: m.display_name,
          }]
        : [];
    }),
  };
}

// Business ------------------------------------------------------------------

// The database functions pick the caller's own business (the first one GET /me
// lists) and only its owner may write it, so no route takes a business id.
export type BusinessChanges = {
  name?: string | undefined;
  shortName?: string | undefined;
  website?: string | undefined;
  takingRequests?: boolean | undefined;
  nightJobs?: boolean | undefined;
};
export type NewBusiness = { name: string; category: string; website?: string | undefined; ownerName?: string | undefined };
export type PriceInput = { id?: string | undefined; label: string; amount: number };
export type FeeInput = { id?: string | undefined; label: string; amount: number; atNight: boolean };
export type HoursInput = { weekday: number; opens: string; closes: string };
export type AreaInput = { lat: number; lng: number; radiusKm: number };

export async function getBusiness(s: OwnerSession) {
  return businessOrNotFound(unwrap(await s.db.rpc("owner_business")));
}

// Idempotent: a caller who already has a business gets it updated, never a second one.
export async function createBusiness(s: OwnerSession, business: NewBusiness) {
  const args = {
    p_name: business.name,
    p_category: business.category,
    p_website: business.website,
    p_owner_name: business.ownerName,
  };
  return businessOrNotFound(unwrap(await s.db.rpc("owner_create_business", withoutUndefined(args))));
}

export async function updateBusiness(s: OwnerSession, changes: BusinessChanges) {
  const args = {
    p_name: changes.name,
    p_short_name: changes.shortName,
    p_website: changes.website,
    p_taking_requests: changes.takingRequests,
    p_night_jobs: changes.nightJobs,
  };
  return businessOrNotFound(unwrap(await s.db.rpc("owner_update_business", withoutUndefined(args))));
}

export async function savePrices(s: OwnerSession, prices: PriceInput[]) {
  return businessOrNotFound(unwrap(await s.db.rpc("owner_save_prices", { p_prices: prices })));
}

export async function saveFees(s: OwnerSession, fees: FeeInput[]) {
  return businessOrNotFound(unwrap(await s.db.rpc("owner_save_fees", { p_fees: fees })));
}

export async function saveHours(s: OwnerSession, hours: HoursInput[]) {
  return businessOrNotFound(unwrap(await s.db.rpc("owner_save_hours", { p_hours: hours })));
}

export async function saveArea(s: OwnerSession, area: AreaInput) {
  return businessOrNotFound(
    unwrap(await s.db.rpc("owner_save_area", { p_lat: area.lat, p_lng: area.lng, p_radius_km: area.radiusKm })),
  );
}

function businessOrNotFound(row: unknown) {
  const business = z.record(z.unknown()).nullable().parse(row);
  if (!business) {
    throw new HttpError(404, "not_found", "No business on this account.");
  }
  return business;
}

// An absent argument keeps the database default, which keeps the stored value.
function withoutUndefined(args: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(args).filter(([, value]) => value !== undefined));
}

// Requests (offers) ---------------------------------------------------------

export async function listOffers(s: OwnerSession, status: string, limit = 50) {
  const rows = items.parse(unwrap(await s.db.rpc("owner_offers", { p_status: status, p_limit: limit })));
  return withMediaLinks(s.db, rows, "media");
}

// One request card; 404 when it does not exist or belongs to another business.
export async function getOffer(s: OwnerSession, offerId: string) {
  const row = z
    .record(z.unknown())
    .nullable()
    .parse(unwrap(await s.db.rpc("owner_offer", { p_handoff_id: offerId })));
  if (!row) {
    throw new HttpError(404, "not_found", "Request not found.");
  }
  const [offer] = await withMediaLinks(s.db, [row], "media");
  return offer;
}

export async function acceptOffer(s: OwnerSession, offerId: string) {
  const offer = toOffer(handoffRow.parse(unwrap(await s.db.rpc("accept_handoff", { p_handoff_id: offerId }))));
  if (offer.status === "expired") {
    throw new HttpError(409, "offer_expired", "This request expired before you accepted it.");
  }
  return offer;
}

export async function declineOffer(s: OwnerSession, offerId: string, reason: string, note?: string | undefined) {
  return toOffer(
    handoffRow.parse(
      unwrap(await s.db.rpc("decline_handoff", { p_handoff_id: offerId, p_reason: reason, p_note: note ?? null })),
    ),
  );
}

// Chats ---------------------------------------------------------------------

export async function listConversations(s: OwnerSession, limit = 50) {
  return items.parse(unwrap(await s.db.rpc("owner_conversations", { p_limit: limit })));
}

export async function listMessages(s: OwnerSession, conversationId: string, before?: string, limit = 50) {
  const rows = items.parse(
    unwrap(
      await s.db.rpc("owner_conversation_messages", {
        p_conversation_id: conversationId,
        p_before: before ?? null,
        p_limit: limit,
      }),
    ),
  );
  return withMediaLinks(s.db, rows, "media");
}

// The business whose accepted handoff opened this chat for the owner.
async function openChatBusiness(s: OwnerSession, conversationId: string): Promise<string> {
  const row = z
    .object({ tenant_id: uuid })
    .nullable()
    .parse(
      unwrap(
        await s.db
          .from("handoffs")
          .select("tenant_id")
          .eq("conversation_id", conversationId)
          .eq("status", "accepted")
          .maybeSingle(),
      ),
    );
  if (!row) {
    throw new HttpError(422, "chat_closed", "This chat is not open to your business.");
  }
  return row.tenant_id;
}

const sentMessage = z.object({ id: uuid, created_at: z.string(), delivery: z.string() });

// Option A: the owner's text as written, queued for WhatsApp.
export async function sendMessage(s: OwnerSession, conversationId: string, text: string) {
  const tenantId = await openChatBusiness(s, conversationId);
  const row = sentMessage.parse(
    unwrap(
      await s.db
        .from("messages")
        .insert({ conversation_id: conversationId, tenant_id: tenantId, sender: "owner", author_user_id: s.userId, body: text })
        .select("id, created_at, delivery")
        .single(),
    ),
  );
  return { id: row.id, sentAt: row.created_at, status: row.delivery, delivery: "as_written" as const };
}

export async function markRead(s: OwnerSession, conversationId: string) {
  unwrap(await s.db.rpc("mark_conversation_read", { p_conversation_id: conversationId }));
  return { conversationId };
}

// Option B: save the owner's text, then ask Zukki for a clearer version.
// polished is null when the model is unavailable or changed a number.
export async function createDraft(
  s: OwnerSession,
  conversationId: string,
  text: string,
  deps: { serviceDb: SupabaseClient; chat?: (request: ChatRequest) => Promise<ChatChoice> },
) {
  const tenantId = await openChatBusiness(s, conversationId);
  const draft = z.object({ id: uuid }).parse(
    unwrap(
      await s.db
        .from("message_drafts")
        .insert({ conversation_id: conversationId, tenant_id: tenantId, author_user_id: s.userId, original_body: text })
        .select("id")
        .single(),
    ),
  );
  const polished = deps.chat ? await polishOwnerMessage(deps.chat, text).catch(() => null) : null;
  if (polished) {
    // Owners cannot write polished_body; the server does, scoped to this draft.
    unwrap(
      await deps.serviceDb
        .from("message_drafts")
        .update({ polished_body: polished.text, language: polished.language })
        .eq("id", draft.id)
        .eq("author_user_id", s.userId)
        .eq("status", "pending"),
    );
  }
  return { draftId: draft.id, original: text, polished: polished?.text ?? null, language: polished?.language ?? null };
}

export async function sendDraft(s: OwnerSession, draftId: string, usePolished: boolean) {
  const row = sentMessage
    .extend({ polished: z.boolean() })
    .parse(unwrap(await s.db.rpc("send_message_draft", { p_draft_id: draftId, p_use_polished: usePolished })));
  return { id: row.id, sentAt: row.created_at, status: row.delivery, delivery: row.polished ? "polished" : "as_written" };
}

// Jobs ----------------------------------------------------------------------

export async function listJobs(s: OwnerSession, limit = 50) {
  return items.parse(unwrap(await s.db.rpc("owner_jobs", { p_job_id: null, p_limit: limit })));
}

export async function getJob(s: OwnerSession, jobId: string) {
  const [job] = items.parse(unwrap(await s.db.rpc("owner_jobs", { p_job_id: jobId, p_limit: 1 })));
  if (!job) {
    throw new HttpError(404, "not_found", "Job not found.");
  }
  return job;
}

const quoteRow = z.object({
  id: uuid,
  job_id: uuid,
  status: z.string(),
  total_min: z.number(),
  total_max: z.number(),
  arrival_from: z.string(),
  arrival_to: z.string(),
});

export async function sendQuote(
  s: OwnerSession,
  jobId: string,
  quote: {
    lines: QuoteLine[];
    arrivalFrom: string;
    arrivalTo: string;
    technicianId?: string | undefined;
    note?: string | undefined;
  },
) {
  const row = quoteRow.parse(
    unwrap(
      await s.db.rpc("send_quote", {
        p_job_id: jobId,
        p_lines: quote.lines,
        p_arrival_from: quote.arrivalFrom,
        p_arrival_to: quote.arrivalTo,
        p_technician_id: quote.technicianId ?? null,
        p_note: quote.note ?? null,
      }),
    ),
  );
  return {
    id: row.id,
    jobId: row.job_id,
    status: row.status,
    total: { min: row.total_min, max: row.total_max },
    arrivalFrom: row.arrival_from,
    arrivalTo: row.arrival_to,
  };
}

export async function transitionJob(s: OwnerSession, jobId: string, to: string, reason: string) {
  const row = z
    .object({ id: uuid, state: z.string() })
    .parse(unwrap(await s.db.rpc("owner_transition_job", { p_job_id: jobId, p_to: to, p_reason: reason })));
  return { id: row.id, state: row.state };
}

// Story Packs ---------------------------------------------------------------

const contentSourceRows = z.array(z.object({
  id: uuid,
  businessId: uuid,
  businessName: z.string().min(1),
  jobTitle: z.string().min(1),
  state: z.literal("done"),
  shareConsent: z.literal("yes"),
  assets: z.array(z.object({
    id: uuid,
    role: z.enum(["before", "after"]),
    storagePath: z.string().min(1),
    revision: storyPackMediaRevisionSchema.shape.revision,
    thumbPath: z.string().nullable().optional(),
  })),
}));

const contentDraftRow = z.object({
  id: uuid,
  source: z.enum(["job", "story_pack", "prices", "reminder"]),
  source_job_id: uuid.nullable(),
  source_media_ids: z.array(uuid),
  title: z.string().nullable(),
  caption: z.string(),
  slides: storySlidesSchema.nullable(),
  approved_media: z.array(storyPackMediaRevisionSchema).nullable(),
  platforms: z.array(z.enum(["facebook_page", "instagram"])),
  scheduled_at: z.string().nullable(),
  status: z.enum(["draft", "approved", "published", "rejected"]),
  reviewed_at: z.string().nullable(),
  published_at: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  deleted_at: z.string().nullable().optional(),
});

type ContentSourceRow = z.infer<typeof contentSourceRows>[number];
type ContentDraftRow = z.infer<typeof contentDraftRow>;

async function listContentSourceRows(s: OwnerSession, jobIds?: string[]): Promise<ContentSourceRow[]> {
  if (jobIds?.length === 0) return [];
  return contentSourceRows.parse(
    unwrap(await s.db.rpc("owner_content_sources", { p_limit: 100, ...(jobIds ? { p_job_ids: jobIds } : {}) })),
  );
}

const CONTENT_DRAFT_FIELDS = [
  "id",
  "source",
  "source_job_id",
  "source_media_ids",
  "title",
  "caption",
  "slides",
  "approved_media",
  "platforms",
  "scheduled_at",
  "status",
  "reviewed_at",
  "published_at",
  "created_at",
  "updated_at",
  "deleted_at",
].join(", ");

function toContentDraft(row: ContentDraftRow, canHandoff = false): StoryPackDraftDto {
  return {
    id: row.id,
    source: row.source,
    sourceJobId: row.source_job_id,
    sourceMediaIds: row.source_media_ids,
    title: row.title,
    caption: row.caption,
    slides: row.slides,
    platforms: row.platforms,
    scheduledAt: row.scheduled_at,
    status: row.status,
    reviewedAt: row.reviewed_at,
    publishedAt: row.published_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    canHandoff,
  };
}

// Eligibility belongs to the exact selected set, never another before/after
// pair that happens to still exist on the same job.
function hasBeforeAndAfter(assets: ContentSourceRow["assets"]): boolean {
  return assets.some((asset) => asset.role === "before") && assets.some((asset) => asset.role === "after");
}

function selectedSource(
  sources: ContentSourceRow[],
  jobId: string | null,
  ids: string[],
): ContentSourceRow | null {
  const source = sources.find((row) => row.id === jobId);
  if (!source || ids.length !== 2 || new Set(ids).size !== 2) return null;
  const assets = ids.flatMap((id) => source.assets.filter((asset) => asset.id === id));
  if (assets.length !== 2 || !hasBeforeAndAfter(assets)) return null;
  return { ...source, assets };
}

function eligibleDraftSource(row: ContentDraftRow, sources: ContentSourceRow[]): ContentSourceRow | null {
  if (row.source !== "story_pack" || !row.slides || row.platforms.length === 0 || row.deleted_at) {
    return null;
  }
  const source = selectedSource(sources, row.source_job_id, row.source_media_ids);
  if (!source) return null;
  if (row.status === "approved" && !matchesApprovedMedia(source, row.approved_media)) return null;
  return source;
}

function matchesApprovedMedia(source: ContentSourceRow, approved: ContentDraftRow["approved_media"]): boolean {
  if (!approved || approved.length !== 2 || source.assets.length !== 2) return false;
  const byId = new Map(approved.map((asset) => [asset.id, asset]));
  if (byId.size !== 2) return false;
  return source.assets.every((asset) => {
    const expected = byId.get(asset.id);
    return expected?.role === asset.role && expected.revision === asset.revision;
  });
}

function canHandoff(row: ContentDraftRow, sources: ContentSourceRow[]): boolean {
  return row.status === "approved" && eligibleDraftSource(row, sources) !== null;
}

function sameAsset(a: ContentSourceRow["assets"][number], b: ContentSourceRow["assets"][number]): boolean {
  return a.id === b.id && a.role === b.role && a.storagePath === b.storagePath && a.revision === b.revision;
}

function toContentSource(row: ContentSourceRow, links: Map<string, string>): StoryPackSourceDto {
  return {
    id: row.id,
    businessName: row.businessName,
    jobTitle: row.jobTitle,
    state: "done",
    shareConsent: "yes",
    isDemo: false,
    assets: row.assets.flatMap((asset) => {
      const imageUrl = links.get(asset.storagePath);
      return imageUrl ? [{
        id: asset.id,
        role: asset.role,
        label: asset.role === "before" ? "Before photo" : "After photo",
        imageUrl,
        revision: asset.revision,
      }] : [];
    }),
  };
}

export async function listContentSources(s: OwnerSession): Promise<StoryPackSourceDto[]> {
  const rows = await listContentSourceRows(s);
  const paths = rows.flatMap((row) => row.assets.map((asset) => asset.storagePath));
  if (paths.length === 0) return [];
  const links = await signPaths(s.db, paths);
  const current = await listContentSourceRows(s);
  return rows.flatMap((row) => {
    const latest = current.find((source) => source.id === row.id);
    if (!latest) return [];
    // Recheck consent, completion, membership and photo identity after signing.
    const assets = row.assets.filter((asset) => latest.assets.some((fresh) => sameAsset(asset, fresh)) && links.has(asset.storagePath));
    return hasBeforeAndAfter(assets) ? [toContentSource({ ...latest, assets }, links)] : [];
  });
}

export async function listContentDrafts(s: OwnerSession): Promise<StoryPackDraftDto[]> {
  const rows = await s.db
    .from("content_drafts")
    .select(CONTENT_DRAFT_FIELDS)
    .eq("source", "story_pack")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(100);
  const drafts = contentDraftRow.array().parse(unwrap(rows));
  const activeDrafts = drafts.filter((row) => !row.deleted_at);
  const jobIds = [...new Set(activeDrafts.flatMap((row) => (row.source_job_id ? [row.source_job_id] : [])))];
  const sources = await listContentSourceRows(s, jobIds);
  return activeDrafts.map((row) => toContentDraft(row, canHandoff(row, sources)));
}

export async function createContentDraft(s: OwnerSession, input: StoryPackCreate): Promise<StoryPackDraftDto> {
  const sources = await listContentSourceRows(s, [input.sourceJobId]);
  if (!sources.some((row) => row.id === input.sourceJobId)) {
    throw new HttpError(404, "not_found", "This completed job is not available for a Story Pack.");
  }
  const source = selectedSource(sources, input.sourceJobId, input.sourceMediaIds);
  if (!source) throw new HttpError(422, "source_media_invalid", "Choose before and after photos from this completed job.");
  const row = contentDraftRow.parse(unwrap(await s.db.from("content_drafts").insert({
    tenant_id: source.businessId,
    source: "story_pack",
    source_job_id: source.id,
    source_media_ids: input.sourceMediaIds,
    title: input.title,
    caption: input.caption,
    slides: input.slides,
    platforms: input.platforms,
  }).select(CONTENT_DRAFT_FIELDS).single()));
  return toContentDraft(row);
}

export async function updateContentDraft(
  s: OwnerSession,
  draftId: string,
  input: StoryPackUpdate,
): Promise<StoryPackDraftDto> {
  const changes = Object.fromEntries(
    Object.entries({
      title: input.title,
      caption: input.caption,
      slides: input.slides,
      platforms: input.platforms,
    }).filter(([, value]) => value !== undefined),
  );
  // Compare and write in one database statement; never retry with a newer version.
  const updated = unwrap(
    await s.db
      .from("content_drafts")
      .update(changes)
      .eq("id", draftId)
      .eq("source", "story_pack")
      .eq("status", "draft")
      .is("deleted_at", null)
      .eq("updated_at", input.expectedUpdatedAt)
      .select(CONTENT_DRAFT_FIELDS)
      .maybeSingle(),
  );
  if (!updated) {
    // This read only distinguishes unavailable rows from a version conflict.
    const current = unwrap(
      await s.db.from("content_drafts").select("id, deleted_at")
        .eq("id", draftId).eq("source", "story_pack")
        .is("deleted_at", null).maybeSingle(),
    );
    if (!current || current.deleted_at) {
      throw new HttpError(404, "not_found", "Story Pack not found.");
    }
    throw new HttpError(409, "changed_since_read", "The draft changed. Reload it before saving.");
  }
  const row = contentDraftRow.parse(updated);
  if (row.deleted_at) {
    throw new HttpError(404, "not_found", "Story Pack not found.");
  }
  return toContentDraft(row);
}

type StoryDraftRow = ContentDraftRow & {
  source: "story_pack";
  source_job_id: string;
};

async function getStoryDraft(s: OwnerSession, draftId: string): Promise<StoryDraftRow> {
  const row = contentDraftRow.parse(
    unwrap(
      await s.db
        .from("content_drafts")
        .select(CONTENT_DRAFT_FIELDS)
        .eq("id", draftId)
        .is("deleted_at", null)
        .single(),
    ),
  );
  if (row.source !== "story_pack" || !row.source_job_id || row.deleted_at) {
    throw new HttpError(404, "not_found", "Story Pack not found.");
  }
  return { ...row, source: "story_pack", source_job_id: row.source_job_id };
}

export async function reviewContentDraft(
  s: OwnerSession,
  draftId: string,
  input: StoryPackReview,
): Promise<StoryPackDraftDto> {
  const { approve, expectedUpdatedAt, expectedMedia } = input;
  // Keep this route scoped to Story Packs. The locked database transition
  // owns version, consent, completion, exact-media and copy validation.
  await getStoryDraft(s, draftId);
  const row = contentDraftRow.parse(
    unwrap(
      await s.db.rpc("review_content_draft", {
        p_draft_id: draftId,
        p_approve: approve,
        ...(expectedUpdatedAt ? { p_expected_updated_at: expectedUpdatedAt } : {}),
        ...(expectedMedia ? { p_expected_media: expectedMedia } : {}),
      }),
    ),
  );
  // A review receipt does not promise current export eligibility. The UI
  // refresh and every handoff request obtain that independently.
  return toContentDraft(row);
}

// Manual delivery only. Every request obtains current server approval and
// consent, then signs only the selected assets. No social publishing occurs.
export async function handoffContentDraft(s: OwnerSession, draftId: string): Promise<StoryPackHandoffDto> {
  const draft = await getStoryDraft(s, draftId);
  const source = draft.status === "approved"
    ? eligibleDraftSource(draft, await listContentSourceRows(s, [draft.source_job_id]))
    : null;
  if (!source) {
    throw new HttpError(422, "story_pack_ineligible", "This Story Pack is no longer approved and eligible for handoff.");
  }
  const links = await signPaths(s.db, source.assets.map((asset) => asset.storagePath));
  const current = eligibleDraftSource(draft, await listContentSourceRows(s, [draft.source_job_id]));
  if (!current || !source.assets.every((asset) => current.assets.some((fresh) => sameAsset(asset, fresh)))) {
    throw new HttpError(422, "story_pack_ineligible", "The selected photos or sharing permission changed. Reload this Story Pack.");
  }
  if (source.assets.some((asset) => !links.has(asset.storagePath))) {
    throw new HttpError(422, "source_media_unavailable", "The selected photos are unavailable. Reload this Story Pack.");
  }
  return { draft: toContentDraft(draft, true), source: toContentSource(current, links) };
}

// Linked accounts -------------------------------------------------------------

// Column grants keep token_secret_id out of the owner's reach; naming the
// columns keeps it out of this answer even if a grant ever widens.
const LINKED_ACCOUNT_FIELDS = "id, platform, display_name, mode";

const linkedAccountRows = z.array(z.object({
  id: uuid,
  platform: z.enum(["facebook_page", "instagram"]),
  display_name: z.string().nullable(),
  mode: z.enum(["live", "test"]),
}));

export type LinkedAccountDto = {
  id: string;
  platform: "facebook_page" | "instagram";
  displayName: string | null;
  mode: "live" | "test";
};

export async function listLinkedAccounts(s: OwnerSession): Promise<LinkedAccountDto[]> {
  const rows = await s.db.from("linked_accounts").select(LINKED_ACCOUNT_FIELDS).order("platform").order("created_at");
  return linkedAccountRows.parse(unwrap(rows)).map((row) => ({
    id: row.id,
    platform: row.platform,
    displayName: row.display_name,
    mode: row.mode,
  }));
}

// Test Zukki ----------------------------------------------------------------

export async function testZukki(
  s: OwnerSession,
  input: {
    question: string;
    history?: { role: "user" | "assistant"; content: string }[] | undefined;
    businessId?: string | undefined;
  },
  deps: { serviceDb: SupabaseClient; chat?: (request: ChatRequest) => Promise<ChatChoice> },
) {
  if (!deps.chat) {
    throw new HttpError(503, "model_unavailable", "Zukki's model is not connected yet.");
  }
  const { businesses } = await getMe(s);
  const business = input.businessId ? businesses.find((b) => b.id === input.businessId) : businesses[0];
  if (!business) {
    throw new HttpError(404, "not_found", "No business on this account.");
  }
  const { reply, sources } = await askTestZukki({
    tenantId: business.id,
    question: input.question,
    history: input.history,
    chat: deps.chat,
    repo: createSupabaseRepository(deps.serviceDb),
  });
  return { businessId: business.id, reply, sources };
}

// Push tokens ---------------------------------------------------------------

// One device belongs to one user: registering a token first removes the same
// token from every other user (service_role sees rows RLS hides from the
// caller), then upserts it for the signed-in user.
export async function savePushToken(
  s: OwnerSession,
  input: { expoToken: string; platform: "ios" | "android" | "web" },
  deps: { serviceDb: SupabaseClient },
) {
  unwrap(
    await deps.serviceDb.from("push_tokens").delete().neq("user_id", s.userId).eq("expo_token", input.expoToken),
  );
  unwrap(
    await s.db.from("push_tokens").upsert(
      { user_id: s.userId, expo_token: input.expoToken, platform: input.platform },
      { onConflict: "user_id,expo_token" },
    ),
  );
  return { expoToken: input.expoToken, platform: input.platform };
}

export async function deletePushToken(s: OwnerSession, input: { expoToken: string }) {
  unwrap(await s.db.from("push_tokens").delete().eq("user_id", s.userId).eq("expo_token", input.expoToken));
  return { expoToken: input.expoToken };
}
