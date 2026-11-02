// Graph API calls for Facebook Login and for posting to Pages and Instagram.
// Every call that carries an access token also carries appsecret_proof, the
// HMAC-SHA256 of the token keyed with the app secret
// (https://developers.facebook.com/docs/graph-api/securing-requests).
// Errors carry Meta's message, never a token or the app secret.
import { createHmac } from "node:crypto";
import { z } from "zod";
import type { MetaConfig } from "../config.ts";

export type MetaDeps = {
  config: MetaConfig;
  fetch?: typeof fetch | undefined;
  // Waits between Instagram container status checks; tests pass a no-op.
  sleep?: ((ms: number) => Promise<void>) | undefined;
};

export type MetaPage = {
  id: string;
  name: string;
  accessToken: string;
  instagram: { id: string; username: string } | null;
};

export class MetaGraphError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MetaGraphError";
  }
}

const GRAPH_HOST = "https://graph.facebook.com";
const TIMEOUT_MS = 20_000;
// Photo containers are usually ready at once; video guidance is once a minute for five minutes.
const STATUS_CHECKS = 10;
const STATUS_WAIT_MS = 3_000;

const tokenResponse = z.object({ access_token: z.string().min(1) });
const pagesResponse = z.object({
  data: z.array(z.object({
    id: z.string().regex(/^[0-9]{1,32}$/),
    name: z.string(),
    access_token: z.string().min(1),
    instagram_business_account: z.object({ id: z.string().regex(/^[0-9]{1,32}$/), username: z.string().optional() }).optional(),
  })),
});
const idResponse = z.object({ id: z.string().regex(/^[0-9_A-Za-z-]{1,64}$/) });
const statusResponse = z.object({ status_code: z.string() });
const errorResponse = z.object({ error: z.object({ message: z.string() }) });

export function createMetaGraph(deps: MetaDeps) {
  const { config } = deps;
  const send = deps.fetch ?? fetch;

  return {
    // Manual flow, step "Exchanging Code for an Access Token":
    // https://developers.facebook.com/docs/facebook-login/guides/advanced/manual-flow
    async exchangeCode(code: string): Promise<string> {
      const query = { client_id: config.appId, redirect_uri: config.redirectUri, client_secret: config.appSecret, code };
      return tokenResponse.parse(await call("GET", "oauth/access_token", query)).access_token;
    },

    // About 60 days instead of about an hour; Page tokens read with it do not expire:
    // https://developers.facebook.com/docs/facebook-login/guides/access-tokens/get-long-lived
    async longLivedUserToken(userToken: string): Promise<string> {
      const query = {
        grant_type: "fb_exchange_token",
        client_id: config.appId,
        client_secret: config.appSecret,
        fb_exchange_token: userToken,
      };
      return tokenResponse.parse(await call("GET", "oauth/access_token", query)).access_token;
    },

    // The Pages the user shared, each with its Page token and connected Instagram account:
    // https://developers.facebook.com/docs/instagram-platform/instagram-api-with-facebook-login/get-started
    // (nested fields: https://developers.facebook.com/docs/graph-api/guides/field-expansion).
    async listPages(userToken: string): Promise<MetaPage[]> {
      const fields = "id,name,access_token,instagram_business_account{id,username}";
      const body = pagesResponse.parse(await call("GET", "me/accounts", { fields, limit: "100" }, userToken));
      return body.data.map((page) => ({
        id: page.id,
        name: page.name,
        accessToken: page.access_token,
        instagram: page.instagram_business_account
          ? { id: page.instagram_business_account.id, username: page.instagram_business_account.username ?? "" }
          : null,
      }));
    },

    // Photos uploaded unpublished, then one feed post that attaches them ("Publishing a multi-photo
    // post with uploaded photos", https://developers.facebook.com/docs/graph-api/reference/page/photos/).
    // Answers the Page post id.
    async postToPage(pageId: string, pageToken: string, caption: string, imageUrls: string[]): Promise<string> {
      const attached: Record<string, string> = {};
      for (const [index, url] of imageUrls.entries()) {
        const photo = idResponse.parse(await call("POST", `${pageId}/photos`, { url, published: "false" }, pageToken));
        attached[`attached_media[${index}]`] = JSON.stringify({ media_fbid: photo.id });
      }
      const post = await call("POST", `${pageId}/feed`, { message: caption, ...attached }, pageToken);
      return idResponse.parse(post).id;
    },

    // A container (a carousel for several photos), its status, then media_publish
    // (https://developers.facebook.com/docs/instagram-platform/content-publishing). JPEG only.
    // Answers the Instagram media id.
    async postToInstagram(igUserId: string, pageToken: string, caption: string, imageUrls: string[]): Promise<string> {
      const containerId = imageUrls.length === 1
        ? await createContainer(igUserId, pageToken, { image_url: imageUrls[0]!, caption })
        : await createCarousel(igUserId, pageToken, caption, imageUrls);
      await waitUntilReady(containerId, pageToken);
      const media = await call("POST", `${igUserId}/media_publish`, { creation_id: containerId }, pageToken);
      return idResponse.parse(media).id;
    },
  };

  async function createCarousel(igUserId: string, pageToken: string, caption: string, imageUrls: string[]): Promise<string> {
    const children: string[] = [];
    for (const url of imageUrls) {
      children.push(await createContainer(igUserId, pageToken, { image_url: url, is_carousel_item: "true" }));
    }
    return createContainer(igUserId, pageToken, { media_type: "CAROUSEL", children: children.join(","), caption });
  }

  async function createContainer(igUserId: string, pageToken: string, params: Record<string, string>): Promise<string> {
    return idResponse.parse(await call("POST", `${igUserId}/media`, params, pageToken)).id;
  }

  async function waitUntilReady(containerId: string, pageToken: string): Promise<void> {
    const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
    for (let check = 0; check < STATUS_CHECKS; check++) {
      const { status_code: status } = statusResponse.parse(await call("GET", containerId, { fields: "status_code" }, pageToken));
      if (status === "FINISHED") return;
      if (status !== "IN_PROGRESS") throw new MetaGraphError(`Instagram could not prepare the photos (${status}).`);
      await sleep(STATUS_WAIT_MS);
    }
    throw new MetaGraphError("Instagram is still preparing the photos. Try again in a minute.");
  }

  async function call(method: "GET" | "POST", path: string, params: Record<string, string>, accessToken?: string): Promise<unknown> {
    const all = new URLSearchParams(params);
    if (accessToken) {
      all.set("access_token", accessToken);
      all.set("appsecret_proof", appSecretProof(accessToken, config.appSecret));
    }
    const url = `${GRAPH_HOST}/${config.graphVersion}/${path}`;
    const response = await send(method === "GET" ? `${url}?${all}` : url, {
      method,
      ...(method === "POST" ? { body: all } : {}),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const parsed = errorResponse.safeParse(body);
      throw new MetaGraphError(parsed.success ? parsed.data.error.message : `Graph API answered ${response.status}`);
    }
    return body;
  }
}

function appSecretProof(accessToken: string, appSecret: string): string {
  return createHmac("sha256", appSecret).update(accessToken).digest("hex");
}
