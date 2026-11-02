// "Approve and post" (odd/tasks/owner-meta-publishing.md S3, S5): an approved
// Story Pack goes to each platform it targets with the Page token stored at
// link time. Each post id is recorded as it succeeds, and the database marks
// the draft published with the last one, so a failure leaves it approved and
// a retry posts only the platforms still missing.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { StoryPackDraftDto } from "@owl-hours/shared";
import { z } from "zod";
import type { OwnerSession } from "../http/auth.ts";
import { HttpError } from "../http/respond.ts";
import { createMetaGraph, MetaGraphError, type MetaDeps } from "../meta/graph.ts";
import type { Unavailable } from "../v1-live.ts";
import { unwrap } from "./db-result.ts";
import { requireMeta } from "./owner-meta.ts";
import { handoffContentDraft, readContentDraft } from "./owner-service.ts";

type Platform = "facebook_page" | "instagram";
type Account = { platform: Platform; externalId: string; token: string };
type Outcome = { platform: Platform; error: string | null };

export type PublishDeps = { meta?: MetaDeps | Unavailable | undefined; serviceDb: SupabaseClient };

const PLATFORM_NAMES: Record<Platform, string> = { facebook_page: "Facebook", instagram: "Instagram" };
const platform = z.enum(["facebook_page", "instagram"]);
const draftStatusRow = z.object({ tenant_id: z.string().uuid(), status: z.enum(["draft", "approved", "published", "rejected"]) });
const tokenRows = z.array(z.object({ platform, external_id: z.string(), access_token: z.string().min(1) }));

export async function publishContentDraft(s: OwnerSession, draftId: string, deps: PublishDeps): Promise<StoryPackDraftDto> {
  const graph = createMetaGraph(requireMeta(deps.meta));
  const tenantId = await approvedDraftTenant(s, draftId);
  // The handoff rechecks approval, consent and the exact photos, and signs short-lived links Meta downloads.
  const { draft, source } = await handoffContentDraft(s, draftId);
  const targets = await unpostedPlatforms(s, draft);
  const accounts = await accountsFor(deps.serviceDb, tenantId, s.userId, targets);
  const imageUrls = source.assets.map((asset) => asset.imageUrl);
  const outcomes: Outcome[] = [];
  let latest: StoryPackDraftDto = draft;
  for (const account of accounts) {
    try {
      const externalId = account.platform === "facebook_page"
        ? await graph.postToPage(account.externalId, account.token, draft.caption, imageUrls)
        : await graph.postToInstagram(account.externalId, account.token, draft.caption, imageUrls);
      latest = await recordPost(deps.serviceDb, draftId, account.platform, externalId);
      outcomes.push({ platform: account.platform, error: null });
    } catch (error) {
      if (!(error instanceof MetaGraphError)) throw error;
      outcomes.push({ platform: account.platform, error: error.message });
    }
  }
  if (outcomes.some((outcome) => outcome.error)) {
    throw new HttpError(502, "publish_failed", describeFailure(outcomes));
  }
  return latest;
}

// The draft is read as the owner, so RLS decides the business; the client never sends one.
async function approvedDraftTenant(s: OwnerSession, draftId: string): Promise<string> {
  const row = unwrap(await s.db.from("content_drafts").select("tenant_id, status")
    .eq("id", draftId).is("deleted_at", null).maybeSingle());
  if (!row) throw new HttpError(404, "not_found", "Story Pack not found.");
  const draft = draftStatusRow.parse(row);
  if (draft.status === "published") throw new HttpError(409, "already_published", "This post is already published.");
  if (draft.status !== "approved") throw new HttpError(422, "not_approved", "Approve this post before posting it.");
  return draft.tenant_id;
}

async function unpostedPlatforms(s: OwnerSession, draft: StoryPackDraftDto): Promise<Platform[]> {
  const rows = z.array(z.object({ platform }))
    .parse(unwrap(await s.db.from("content_publications").select("platform").eq("draft_id", draft.id)));
  const posted = new Set(rows.map((row) => row.platform));
  return draft.platforms.filter((target) => !posted.has(target));
}

// One account per platform: the earliest linked. Nothing is posted unless every target is linked.
async function accountsFor(db: SupabaseClient, tenantId: string, userId: string, targets: Platform[]): Promise<Account[]> {
  const rows = tokenRows.parse(unwrap(await db.rpc("linked_account_tokens", { p_tenant_id: tenantId, p_user_id: userId })));
  return targets.map((target) => {
    const row = rows.find((candidate) => candidate.platform === target);
    if (!row) {
      throw new HttpError(422, "account_not_linked",
        `Connect ${PLATFORM_NAMES[target]} in Content > Linked accounts before posting.`);
    }
    return { platform: target, externalId: row.external_id, token: row.access_token };
  });
}

async function recordPost(db: SupabaseClient, draftId: string, target: Platform, externalId: string): Promise<StoryPackDraftDto> {
  const row = unwrap(await db.rpc("record_content_publication",
    { p_draft_id: draftId, p_platform: target, p_external_id: externalId }));
  return readContentDraft(row);
}

function describeFailure(outcomes: Outcome[]): string {
  const lines = outcomes.map((outcome) => `${PLATFORM_NAMES[outcome.platform]}: ${outcome.error ?? "posted."}`);
  return `${lines.join(" ")} The post stays approved; try again to post the rest.`;
}
