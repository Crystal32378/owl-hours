// Linking the owner's Facebook Page and its Instagram professional account
// (odd/tasks/owner-meta-publishing.md S2, S5). The owner asks for a Facebook
// Login URL; Meta sends the browser back to the public callback with a code
// and our signed state; the callback stores each Page token in Vault through
// service_role and returns the owner to the owner web app.
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { RepositoryError } from "../db/repository.ts";
import type { OwnerSession } from "../http/auth.ts";
import { HttpError } from "../http/respond.ts";
import { createMetaGraph, MetaGraphError, type MetaDeps, type MetaPage } from "../meta/graph.ts";
import { readOAuthState, signOAuthState, type OAuthOwner, type OAuthState } from "../meta/oauth-state.ts";
import type { Unavailable } from "../v1-live.ts";
import { unwrap } from "./db-result.ts";

export type MetaLinkDeps = {
  meta?: MetaDeps | Unavailable | undefined;
  serviceDb: SupabaseClient;
  serverKey: string;
  now?: (() => number) | undefined;
};

// Listing Pages and posting to them and to their Instagram accounts:
// https://developers.facebook.com/docs/permissions,
// https://developers.facebook.com/docs/pages-api/posts,
// https://developers.facebook.com/docs/instagram-platform/content-publishing
export const META_PERMISSIONS = [
  "pages_show_list",
  "pages_read_engagement",
  "pages_manage_posts",
  "instagram_basic",
  "instagram_content_publish",
];

// Why the callback sent the owner back without linking (the owner app reads it).
export type LinkFailure = "invalid_state" | "denied" | "invalid_request" | "meta_error" | "no_pages" | "forbidden" | "failed";

export async function metaConnectUrl(s: OwnerSession, deps: MetaLinkDeps): Promise<{ url: string }> {
  const { config } = requireMeta(deps.meta);
  const tenantId = z.string().uuid().parse(unwrap(await s.db.rpc("caller_owned_business_id")));
  const state = signOAuthState({ tenantId, userId: s.userId }, deps.serverKey, clock(deps));
  // The login dialog: https://developers.facebook.com/docs/facebook-login/guides/advanced/manual-flow
  // A Facebook Login for Business configuration replaces the scopes:
  // https://developers.facebook.com/docs/facebook-login/facebook-login-for-business
  const url = new URL(`https://www.facebook.com/${config.graphVersion}/dialog/oauth`);
  url.searchParams.set("client_id", config.appId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("response_type", "code");
  if (config.loginConfigId) {
    url.searchParams.set("config_id", config.loginConfigId);
  } else {
    url.searchParams.set("scope", META_PERMISSIONS.join(","));
  }
  return { url: url.href };
}

// Where the callback sends the browser: the owner app's Linked accounts, with
// meta=linked, or meta=error and the reason.
export async function finishMetaLink(deps: MetaLinkDeps, query: Record<string, string>): Promise<string> {
  const meta = requireMeta(deps.meta);
  const failure = await linkFromCallback(meta, deps, query);
  const url = new URL(meta.config.ownerReturnUrl);
  url.searchParams.set("meta", failure ? "error" : "linked");
  if (failure) url.searchParams.set("reason", failure);
  return url.href;
}

export async function unlinkAccount(s: OwnerSession, accountId: string): Promise<{ id: string }> {
  // RLS lets only the business owner delete; a trigger deletes the Vault secret with the row.
  const rows = z.array(z.object({ id: z.string().uuid() }))
    .parse(unwrap(await s.db.from("linked_accounts").delete().eq("id", accountId).select("id")));
  const [row] = rows;
  if (!row) throw new HttpError(404, "not_found", "Linked account not found.");
  return row;
}

export function requireMeta(meta: MetaDeps | Unavailable | undefined): MetaDeps {
  if (!meta) throw new HttpError(503, "not_configured", "Facebook and Instagram are not configured on this server.");
  if ("unavailable" in meta) throw new HttpError(503, "not_configured", meta.unavailable);
  return meta;
}

async function linkFromCallback(meta: MetaDeps, deps: MetaLinkDeps, query: Record<string, string>): Promise<LinkFailure | null> {
  const state = readOAuthState(query.state ?? "", deps.serverKey, clock(deps));
  if (!state) return "invalid_state";
  const unusable = await consumeState(deps.serviceDb, state);
  if (unusable) return unusable;
  if (query.error) return "denied";
  if (!query.code) return "invalid_request";
  let pages: MetaPage[];
  // The callback always answers a redirect: a Meta error, an outage or an unexpected answer
  // all return the owner to the app with meta_error. The log names the failure, never a token.
  try {
    pages = await sharedPages(meta, query.code);
  } catch (error) {
    const detail = error instanceof MetaGraphError ? error.message : error instanceof Error ? error.name : "unknown error";
    console.error(`[meta] login exchange failed: ${detail}`);
    return "meta_error";
  }
  if (pages.length === 0) return "no_pages";
  return saveLinks(deps.serviceDb, state.owner, pages);
}

// Each Facebook Login links once: invalid_state when a callback already used this state.
async function consumeState(db: SupabaseClient, state: OAuthState): Promise<LinkFailure | null> {
  try {
    const consumed = await db.rpc("consume_meta_oauth_nonce",
      { p_nonce: state.nonce, p_expires_at: new Date(state.expiresAt).toISOString() });
    return z.boolean().parse(unwrap(consumed)) ? null : "invalid_state";
  } catch (error) {
    console.error(`[meta] consuming the login state failed: ${error instanceof Error ? error.message : String(error)}`);
    return "failed";
  }
}

async function sharedPages(meta: MetaDeps, code: string): Promise<MetaPage[]> {
  const graph = createMetaGraph(meta);
  const userToken = await graph.longLivedUserToken(await graph.exchangeCode(code));
  return graph.listPages(userToken);
}

// Instagram with Facebook Login posts with the Page token
// (https://developers.facebook.com/docs/instagram-platform/content-publishing), so both rows store it.
async function saveLinks(db: SupabaseClient, owner: OAuthOwner, pages: MetaPage[]): Promise<LinkFailure | null> {
  try {
    for (const page of pages) {
      await saveLink(db, owner, { platform: "facebook_page", externalId: page.id, name: page.name, token: page.accessToken });
      if (page.instagram) {
        const name = page.instagram.username ? `@${page.instagram.username}` : page.name;
        await saveLink(db, owner, { platform: "instagram", externalId: page.instagram.id, name, token: page.accessToken });
      }
    }
    return null;
  } catch (error) {
    if (error instanceof RepositoryError && error.code === "42501") return "forbidden";
    console.error(`[meta] saving linked accounts failed: ${error instanceof Error ? error.message : String(error)}`);
    return "failed";
  }
}

type Link = { platform: "facebook_page" | "instagram"; externalId: string; name: string; token: string };

async function saveLink(db: SupabaseClient, owner: OAuthOwner, link: Link): Promise<void> {
  unwrap(await db.rpc("save_linked_account", {
    p_tenant_id: owner.tenantId,
    p_user_id: owner.userId,
    p_platform: link.platform,
    p_external_id: link.externalId,
    p_display_name: link.name,
    p_token: link.token,
  }));
}

function clock(deps: MetaLinkDeps): number {
  return deps.now?.() ?? Date.now();
}
