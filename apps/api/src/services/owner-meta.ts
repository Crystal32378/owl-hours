// Linking the owner's Facebook Page and its Instagram professional account
// (odd/tasks/owner-meta-publishing.md S2, S5). The owner asks for a Facebook
// Login URL; Meta sends the browser back to the public callback with a code
// and our signed state; the callback stores each Page token in Vault through
// service_role and returns the owner to the owner web app.
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { OwnerSession } from "../http/auth.ts";
import { HttpError } from "../http/respond.ts";
import type { MetaDeps } from "../meta/graph.ts";
import { signOAuthState } from "../meta/oauth-state.ts";
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

function clock(deps: MetaLinkDeps): number {
  return deps.now?.() ?? Date.now();
}
