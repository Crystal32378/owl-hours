// POST /v1/owner/content/drafts/:id/publish (odd/tasks/owner-meta-publishing.md S3, S5): an approved
// Story Pack is posted to each targeted linked platform with the stored Page token, every post id is
// recorded, and the draft is published only when every platform posted. Meta is a fake Graph API.
import { createHash, createHmac } from "node:crypto";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../src/index.ts";
import type { V1Deps } from "../src/routes/v1.ts";
import { fakeGraph, graphError, type GraphCall, type GraphReply } from "./helpers/fake-graph.ts";
import { fakeSupabase, type FakeCall, type FakeReply } from "./helpers/fake-supabase.ts";
import { APP_SECRET, MARIO, NORTHSIDE, PAGE_TOKEN, SERVER_KEY, TOKEN, meta } from "./helpers/meta-app.ts";

const JOB = "80000000-0000-4000-8000-000000000001";
const DRAFT = "d0000000-0000-4000-8000-000000000001";
const BEFORE = "60000000-0000-4000-8000-000000000011";
const AFTER = "60000000-0000-4000-8000-000000000012";
const PAGE_ID = "555000111";
const IG_ID = "17841400000000001";

const assets = [
  { id: BEFORE, role: "before", storagePath: `conversations/${JOB}/before.jpg`, thumbPath: null },
  { id: AFTER, role: "after", storagePath: `conversations/${JOB}/after.jpg`, thumbPath: null },
].map((asset) => ({ ...asset, revision: createHash("sha256").update(asset.storagePath).digest("hex") }));
const source = {
  id: JOB, businessId: NORTHSIDE, businessName: "Northside Plumbing", jobTitle: "Bathroom leak repair",
  state: "done", shareConsent: "yes", assets,
};
const approvedRow = {
  id: DRAFT,
  tenant_id: NORTHSIDE,
  source: "story_pack",
  source_job_id: JOB,
  source_media_ids: [BEFORE, AFTER],
  title: "Bathroom leak repair",
  caption: "A completed repair. Message our team.",
  slides: [
    { title: "The job", body: "A leak needed attention." },
    { title: "The work", body: "Our team completed the repair." },
    { title: "Need a hand?", body: "Message our team." },
  ],
  approved_media: assets.map(({ id, role, revision }) => ({ id, role, revision })),
  platforms: ["facebook_page", "instagram"],
  scheduled_at: null,
  status: "approved",
  reviewed_at: "2026-10-30T00:00:00.000Z",
  published_at: null as string | null,
  created_at: "2026-10-29T12:00:00.000Z",
  updated_at: "2026-10-30T00:00:00.000Z",
};
const publishedRow = { ...approvedRow, status: "published", published_at: "2026-11-01T12:00:00.000Z" };
const tokens = [
  { id: "a0000000-0000-4000-8000-000000000001", platform: "facebook_page", external_id: PAGE_ID, access_token: PAGE_TOKEN },
  { id: "a0000000-0000-4000-8000-000000000002", platform: "instagram", external_id: IG_ID, access_token: PAGE_TOKEN },
];
const signedUrl = (id: string) => `https://example.supabase.co/storage/v1/object/sign/media/${id}?token=fresh`;

function ownerDb(row: typeof approvedRow, posted: string[] = []) {
  return (call: FakeCall): FakeReply => {
    if (call.path === "/rest/v1/content_drafts") return { body: row };
    if (call.path === "/rest/v1/content_publications") return { body: posted.map((platform) => ({ platform })) };
    if (call.path === "/rest/v1/rpc/owner_content_sources") return { body: [source] };
    if (call.path === "/storage/v1/object/sign/media") {
      return { body: assets.map((asset) => ({ path: asset.storagePath, signedURL: `/object/sign/media/${asset.id}?token=fresh`, error: null })) };
    }
    return { status: 500, body: {} };
  };
}

function serviceDb(accounts = tokens) {
  return (call: FakeCall): FakeReply => {
    if (call.path === "/rest/v1/rpc/linked_account_tokens") return { body: accounts };
    if (call.path === "/rest/v1/rpc/record_content_publication") {
      return { body: (call.body as { p_platform: string }).p_platform === "instagram" ? publishedRow : approvedRow };
    }
    return { status: 500, body: {} };
  };
}

function metaGraph(call: GraphCall): GraphReply {
  if (call.path === `/v26.0/${PAGE_ID}/photos`) return { body: { id: `photo-${call.params.get("url")?.includes(BEFORE) ? 1 : 2}` } };
  if (call.path === `/v26.0/${PAGE_ID}/feed`) return { body: { id: `${PAGE_ID}_9001` } };
  if (call.path === `/v26.0/${IG_ID}/media` && call.params.get("media_type") === "CAROUSEL") return { body: { id: "carousel-1" } };
  if (call.path === `/v26.0/${IG_ID}/media`) return { body: { id: `item-${call.params.get("image_url")?.includes(BEFORE) ? 1 : 2}` } };
  if (call.path === "/v26.0/carousel-1") return { body: { status_code: "FINISHED", id: "carousel-1" } };
  if (call.path === `/v26.0/${IG_ID}/media_publish`) return { body: { id: "17900000000000001" } };
  return graphError(`unexpected ${call.path}`);
}

type Options = { owner?: (call: FakeCall) => FakeReply; service?: (call: FakeCall) => FakeReply; graph?: (call: GraphCall) => GraphReply; noMeta?: boolean };

function setup(options: Options = {}) {
  const owner = fakeSupabase(options.owner ?? ownerDb(approvedRow));
  const service = fakeSupabase(options.service ?? serviceDb());
  const graph = fakeGraph(options.graph ?? metaGraph);
  const deps: V1Deps = {
    authenticate: async (token) => (token === TOKEN ? { userId: MARIO, db: owner.client } : null),
    serviceDb: service.client,
    serverKey: SERVER_KEY,
    ...(options.noMeta ? {} : { meta: { config: meta, fetch: graph.fetch, sleep: async () => {} } }),
  };
  const { app } = createApp({ v1: deps });
  const publish = (headers: Record<string, string> = { authorization: `Bearer ${TOKEN}` }) =>
    app.request(`/v1/owner/content/drafts/${DRAFT}/publish`, { method: "POST", headers });
  return { publish, ownerCalls: owner.calls, serviceCalls: service.calls, graphCalls: graph.calls };
}

const proof = createHmac("sha256", APP_SECRET).update(PAGE_TOKEN).digest("hex");
const recorded = (calls: FakeCall[]) =>
  calls.filter((call) => call.path === "/rest/v1/rpc/record_content_publication").map((call) => call.body);

describe("POST /v1/owner/content/drafts/:id/publish", () => {
  it("posts the caption and both photos to the Page and to Instagram, then answers the published draft", async () => {
    const { publish, graphCalls, serviceCalls } = setup();

    const response = await publish();

    assert.equal(response.status, 200);
    const body = (await response.json()) as { data: { status: string; publishedAt: string } };
    assert.equal(body.data.status, "published");
    assert.equal(body.data.publishedAt, "2026-11-01T12:00:00.000Z");
    assert.deepEqual(graphCalls.map((call) => `${call.method} ${call.path}`), [
      `POST /v26.0/${PAGE_ID}/photos`,
      `POST /v26.0/${PAGE_ID}/photos`,
      `POST /v26.0/${PAGE_ID}/feed`,
      `POST /v26.0/${IG_ID}/media`,
      `POST /v26.0/${IG_ID}/media`,
      `POST /v26.0/${IG_ID}/media`,
      "GET /v26.0/carousel-1",
      `POST /v26.0/${IG_ID}/media_publish`,
    ]);
    const [beforePhoto, , feed, beforeItem, , carousel, status, mediaPublish] = graphCalls;
    assert.deepEqual(Object.fromEntries(beforePhoto!.params),
      { url: signedUrl(BEFORE), published: "false", access_token: PAGE_TOKEN, appsecret_proof: proof });
    assert.deepEqual(Object.fromEntries(feed!.params), {
      message: approvedRow.caption,
      "attached_media[0]": JSON.stringify({ media_fbid: "photo-1" }),
      "attached_media[1]": JSON.stringify({ media_fbid: "photo-2" }),
      access_token: PAGE_TOKEN,
      appsecret_proof: proof,
    });
    assert.deepEqual(Object.fromEntries(beforeItem!.params),
      { image_url: signedUrl(BEFORE), is_carousel_item: "true", access_token: PAGE_TOKEN, appsecret_proof: proof });
    assert.deepEqual(Object.fromEntries(carousel!.params), {
      media_type: "CAROUSEL", children: "item-1,item-2", caption: approvedRow.caption, access_token: PAGE_TOKEN, appsecret_proof: proof,
    });
    assert.equal(status!.params.get("fields"), "status_code");
    assert.equal(mediaPublish!.params.get("creation_id"), "carousel-1");
    assert.deepEqual(recorded(serviceCalls), [
      { p_draft_id: DRAFT, p_platform: "facebook_page", p_external_id: `${PAGE_ID}_9001` },
      { p_draft_id: DRAFT, p_platform: "instagram", p_external_id: "17900000000000001" },
    ]);
  });

  it("reads the tokens for the draft's own business and the signed-in owner, never a tenant id from the client", async () => {
    const { publish, serviceCalls } = setup();

    await publish();

    const tokenCall = serviceCalls.find((call) => call.path === "/rest/v1/rpc/linked_account_tokens");
    assert.deepEqual(tokenCall?.body, { p_tenant_id: NORTHSIDE, p_user_id: MARIO });
  });

  it("keeps the draft approved and names the failed platform when Instagram fails after the Page posted", async () => {
    const { publish, serviceCalls } = setup({
      graph: (call) => call.path.endsWith("/media_publish") ? graphError("The media is not ready for publishing.") : metaGraph(call),
    });

    const response = await publish();

    assert.equal(response.status, 502);
    const body = (await response.json()) as { error: { code: string; message: string } };
    assert.equal(body.error.code, "publish_failed");
    assert.match(body.error.message, /Facebook: posted/);
    assert.match(body.error.message, /Instagram: The media is not ready for publishing\./);
    assert.doesNotMatch(JSON.stringify(body), new RegExp(`${PAGE_TOKEN}|${APP_SECRET}`));
    assert.deepEqual(recorded(serviceCalls).map((call) => (call as { p_platform: string }).p_platform), ["facebook_page"]);
  });

  it("retries only the platforms that have not posted yet", async () => {
    const { publish, graphCalls } = setup({ owner: ownerDb(approvedRow, ["facebook_page"]) });

    assert.equal((await publish()).status, 200);
    assert.equal(graphCalls.some((call) => call.path.startsWith(`/v26.0/${PAGE_ID}`)), false);
  });

  it("refuses before posting anything when a targeted platform is not linked", async () => {
    const { publish, graphCalls } = setup({ service: serviceDb(tokens.filter((row) => row.platform === "facebook_page")) });

    const response = await publish();

    assert.equal(response.status, 422);
    assert.equal(((await response.json()) as { error: { code: string } }).error.code, "account_not_linked");
    assert.equal(graphCalls.length, 0);
  });

  it("refuses a draft that is not approved, and a published one", async () => {
    const draft = setup({ owner: ownerDb({ ...approvedRow, status: "draft" }) });
    const published = setup({ owner: ownerDb(publishedRow) });

    assert.equal((await draft.publish()).status, 422);
    assert.equal((await published.publish()).status, 409);
    assert.equal(draft.graphCalls.length + published.graphCalls.length, 0);
  });

  it("answers 503 when Facebook and Instagram are not configured", async () => {
    const { publish } = setup({ noMeta: true });

    assert.equal((await publish()).status, 503);
  });

  it("requires the owner's token", async () => {
    const { publish, ownerCalls } = setup();

    assert.equal((await publish({})).status, 401);
    assert.equal(ownerCalls.length, 0);
  });
});
