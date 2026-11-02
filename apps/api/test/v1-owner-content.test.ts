import { createHash } from "node:crypto";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../src/index.ts";
import type { V1Deps } from "../src/routes/v1.ts";
import { fakeSupabase, pgError, type FakeCall, type FakeReply } from "./helpers/fake-supabase.ts";

const MARIO = "20000000-0000-4000-8000-000000000001";
const NORTHSIDE = "10000000-0000-4000-8000-000000000001";
const JOB = "80000000-0000-4000-8000-000000000001";
const DRAFT = "d0000000-0000-4000-8000-000000000001";
const BEFORE = "60000000-0000-4000-8000-000000000011";
const AFTER = "60000000-0000-4000-8000-000000000012";
const OTHER_MEDIA = "60000000-0000-4000-8000-000000000099";
const TOKEN = "owner-access-token-0123456789";
const SERVER_KEY = "server-key-0123456789-0123456789-0123";

const source = {
  id: JOB,
  businessId: NORTHSIDE,
  businessName: "Northside Plumbing",
  jobTitle: "Bathroom leak repair",
  state: "done",
  shareConsent: "yes",
  assets: [
    { id: BEFORE, role: "before", storagePath: `conversations/${JOB}/before.webp`, thumbPath: null },
    { id: AFTER, role: "after", storagePath: `conversations/${JOB}/after.webp`, thumbPath: null },
  ].map(asset => ({ ...asset, revision: createHash("sha256").update(asset.storagePath).digest("hex") })),
};

const approvedMedia = source.assets.map(asset => ({ id: asset.id, role: asset.role,
  revision: createHash("sha256").update(asset.storagePath).digest("hex"),
}));
const approval = { approve: true, expectedUpdatedAt: "2026-10-29T12:00:00.000Z", expectedMedia: approvedMedia };

const slides = [
  { title: "The job", body: "A leak needed attention." },
  { title: "The work", body: "Our team completed the repair." },
  { title: "Need a hand?", body: "Message our team." },
];
const draftRow = {
  id: DRAFT,
  source: "story_pack",
  source_job_id: JOB,
  source_media_ids: [BEFORE, AFTER],
  title: "Bathroom leak repair",
  caption: "A completed repair. Message our team.",
  slides,
  approved_media: null as typeof approvedMedia | null,
  platforms: ["instagram"],
  scheduled_at: null,
  status: "draft",
  reviewed_at: null,
  published_at: null,
  created_at: "2026-10-29T12:00:00.000Z",
  updated_at: "2026-10-29T12:00:00.000Z",
};

function setup(respond: (call: FakeCall) => FakeReply) {
  const owner = fakeSupabase(respond);
  const service = fakeSupabase(() => ({ body: [] }));
  const deps: V1Deps = {
    authenticate: async (token) => token === TOKEN ? { userId: MARIO, db: owner.client } : null,
    serviceDb: service.client,
    serverKey: SERVER_KEY,
  };
  const { app } = createApp({ v1: deps });
  const call = (path: string, init: RequestInit = {}) => app.request(`/v1/owner${path}`, {
    ...init,
    headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json", ...init.headers },
  });
  return { call, calls: owner.calls };
}

const post = (body: unknown): RequestInit => ({ method: "POST", body: JSON.stringify(body) });
const patchDraft = (body: unknown): RequestInit => ({ method: "PATCH", body: JSON.stringify(body) });

describe("/v1/owner Story Pack sources", () => {
  it("returns only server-approved sources and short-lived signed image links", async () => {
    const { call, calls } = setup((request) => {
      if (request.path === "/rest/v1/rpc/owner_content_sources") return { body: [source] };
      if (request.path === "/storage/v1/object/sign/media") {
        return { body: [
          { path: source.assets[0].storagePath, signedURL: "/object/sign/media/before?token=short", error: null },
          { path: source.assets[1].storagePath, signedURL: "/object/sign/media/after?token=short", error: null },
        ] };
      }
      return { status: 500, body: {} };
    });

    const response = await call("/content/sources");
    assert.equal(response.status, 200);
    const body = await response.json() as { data: Record<string, unknown>[] };
    const contentSource = body.data[0] as { assets: Record<string, unknown>[]; businessName: string };
    assert.equal(contentSource.businessName, "Northside Plumbing");
    assert.deepEqual(contentSource.assets.map((asset) => asset.role), ["before", "after"]);
    assert.match(String(contentSource.assets[0]?.imageUrl), /token=short/);
    assert.equal(contentSource.assets[0]?.storagePath, undefined);
    assert.equal(contentSource.assets[0]?.thumbPath, undefined);
    assert.equal(calls[0]?.path, "/rest/v1/rpc/owner_content_sources");
    assert.deepEqual(calls[0]?.body, { p_limit: 100 });
  });
});

describe("Story Pack source links", () => {
  it("keeps a job with more photos than a single draft can select", async () => {
    const many = { ...source, assets: [...source.assets, ...Array.from({ length: 5 }, (_, i) => ({
      ...source.assets[1]!, id: `60000000-0000-4000-8000-00000000010${i}`,
      storagePath: `conversations/${JOB}/extra-${i}.webp`,
    }))] };
    const { call } = setup((request) => request.path === "/rest/v1/rpc/owner_content_sources"
      ? { body: [many] }
      : { body: many.assets.map((asset) => ({ path: asset.storagePath, signedURL: `/object/sign/media/${asset.id}?token=fresh`, error: null })) });
    const response = await call("/content/sources");
    assert.equal(response.status, 200);
    assert.equal(((await response.json()) as { data: { assets: unknown[] }[] }).data[0]?.assets.length, 7);
  });
});

describe("Story source revision contract", () => {
  it("returns the SQL revision rather than calculating a second hash in the API", async () => {
    const revision = "f".repeat(64);
    const serverSource = { ...source, assets: source.assets.map(asset => ({ ...asset, revision })) };
    const { call } = setup(request => request.path === "/rest/v1/rpc/owner_content_sources"
      ? { body: [serverSource] }
      : { body: source.assets.map(asset => ({ path: asset.storagePath, signedURL: `/object/sign/media/${asset.id}?token=fresh`, error: null })) });
    const response = await call("/content/sources");
    assert.equal(response.status, 200);
    const body = await response.json() as { data: { assets: { revision: string }[] }[] };
    assert.equal(body.data[0]?.assets[0]?.revision, revision);
  });
});

describe("/v1/owner Story Pack drafts", () => {
  it("derives tenant scope on the server and inserts only media from the eligible source job", async () => {
    const { call, calls } = setup((request) => {
      if (request.path === "/rest/v1/rpc/owner_content_sources") return { body: [source] };
      if (request.path === "/rest/v1/content_drafts" && request.method === "POST") return { status: 201, body: draftRow };
      return { status: 500, body: {} };
    });

    const response = await call("/content/drafts", post({
      sourceJobId: JOB,
      sourceMediaIds: [BEFORE, AFTER],
      title: "Bathroom leak repair",
      caption: "A completed repair. Message our team.",
      slides,
      platforms: ["instagram"],
    }));
    assert.equal(response.status, 201);
    const created = calls.find((request) => request.path === "/rest/v1/content_drafts");
    assert.deepEqual(created?.body, {
      tenant_id: NORTHSIDE,
      source: "story_pack",
      source_job_id: JOB,
      source_media_ids: [BEFORE, AFTER],
      title: "Bathroom leak repair",
      caption: "A completed repair. Message our team.",
      slides,
      platforms: ["instagram"],
    });
    assert.equal(((await response.json()) as { data: { canHandoff: boolean } }).data.canHandoff, false);
  });

  it("updates only draft fields on a Story Pack", async () => {
    const { call, calls } = setup((request) => {
      if (request.path === "/rest/v1/content_drafts" && request.method === "PATCH") return { body: draftRow };
      if (request.path === "/rest/v1/rpc/owner_content_sources") return { body: [source] };
      return { status: 500, body: {} };
    });
    const response = await call(`/content/drafts/${DRAFT}`, patchDraft({ caption: "Edited repair story.", expectedUpdatedAt: draftRow.updated_at }));
    assert.equal(response.status, 200);
    const update = calls.find((request) => request.path === "/rest/v1/content_drafts");
    assert.deepEqual(update?.body, { caption: "Edited repair story." });
    assert.equal(calls.some(request => request.path === "/rest/v1/rpc/owner_content_sources"), false);
    assert.equal(update?.query.get("source"), "eq.story_pack");
    assert.equal(update?.query.get("status"), "eq.draft");
    assert.equal(((await response.json()) as { data: { canHandoff: boolean } }).data.canHandoff, false);
  });

  it("rejects caller-supplied tenant ids and media ids from another job", async () => {
    const { call, calls } = setup((request) => request.path === "/rest/v1/rpc/owner_content_sources"
      ? { body: [source] }
      : { body: {} });
    const forgedTenant = await call("/content/drafts", post({
      sourceJobId: JOB,
      sourceMediaIds: [BEFORE, AFTER],
      title: "Repair",
      caption: "A completed repair.",
      slides,
      platforms: ["instagram"],
      tenant_id: NORTHSIDE,
    }));
    assert.equal(forgedTenant.status, 400);

    const foreignMedia = await call("/content/drafts", post({
      sourceJobId: JOB,
      sourceMediaIds: [BEFORE, OTHER_MEDIA],
      title: "Repair",
      caption: "A completed repair.",
      slides,
      platforms: ["instagram"],
    }));
    assert.equal(foreignMedia.status, 422);
    assert.equal(calls.some((request) => request.path === "/rest/v1/content_drafts"), false);
  });

  it("rejects 1 or 3+ media ids when creating a Story Pack draft", async () => {
    const extraAssetPath = `conversations/${JOB}/extra.webp`;
    const jobWithExtraMedia = {
      ...source,
      assets: [
        ...source.assets,
        {
          id: OTHER_MEDIA,
          role: "after",
          storagePath: extraAssetPath,
          thumbPath: null,
          revision: createHash("sha256").update(extraAssetPath).digest("hex"),
        },
      ],
    };
    const { call, calls } = setup((request) => request.path === "/rest/v1/rpc/owner_content_sources"
      ? { body: [jobWithExtraMedia] }
      : { status: 201, body: draftRow });

    const singleMedia = await call("/content/drafts", post({
      sourceJobId: JOB,
      sourceMediaIds: [BEFORE],
      title: "Bathroom leak repair",
      caption: "A completed repair.",
      slides,
      platforms: ["instagram"],
    }));
    assert.equal(singleMedia.status, 400);

    const threeMedia = await call("/content/drafts", post({
      sourceJobId: JOB,
      sourceMediaIds: [BEFORE, AFTER, OTHER_MEDIA],
      title: "Bathroom leak repair",
      caption: "A completed repair.",
      slides,
      platforms: ["instagram"],
    }));
    assert.equal(threeMedia.status, 400, "creating draft with 3 media ids must be rejected with 400");
    assert.equal(calls.some((request) => request.path === "/rest/v1/content_drafts"), false);
  });

  it("cannot approve after the source job loses current consent or completion eligibility", async () => {
    const { call, calls } = setup((request) => {
      if (request.path === "/rest/v1/content_drafts") return { body: draftRow };
      if (request.path === "/rest/v1/rpc/review_content_draft") return pgError("23514", "The source is no longer eligible.");
      return { status: 500, body: {} };
    });
    const response = await call(`/content/drafts/${DRAFT}/review`, post(approval));
    assert.equal(response.status, 422);
    assert.equal(calls.some((request) => request.path === "/rest/v1/rpc/review_content_draft"), true);
  });

  it("returns the database review receipt without claiming current handoff availability", async () => {
    const { call } = setup((request) => {
      if (request.path === "/rest/v1/rpc/owner_content_sources") return { body: [source] };
      if (request.path === "/rest/v1/content_drafts") return { body: draftRow };
      if (request.path === "/rest/v1/rpc/review_content_draft") {
        return { body: { ...draftRow, approved_media: approvedMedia, status: "approved", reviewed_at: "2026-10-29T12:01:00.000Z" } };
      }
      return { status: 500, body: {} };
    });
    const response = await call(`/content/drafts/${DRAFT}/review`, post(approval));
    assert.equal(response.status, 200);
    assert.equal(((await response.json()) as { data: { canHandoff: boolean } }).data.canHandoff, false);
  });

  it("does not review legacy marketing drafts through the Story Pack endpoint", async () => {
    const { call, calls } = setup((request) => request.path === "/rest/v1/content_drafts"
      ? { body: { ...draftRow, source: "job" } }
      : { body: {} });
    const response = await call(`/content/drafts/${DRAFT}/review`, post({ approve: false }));
    assert.equal(response.status, 404);
    assert.equal(calls.some((request) => request.path === "/rest/v1/rpc/review_content_draft"), false);
  });

  it("rejects expectedMedia with 1 or 3+ items and rejects expectedMedia with identical roles", async () => {
    const { call, calls } = setup((request) => {
      if (request.path === "/rest/v1/content_drafts") return { body: draftRow };
      return { status: 500, body: {} };
    });

    const singleExpected = await call(`/content/drafts/${DRAFT}/review`, post({
      ...approval,
      expectedMedia: [approval.expectedMedia[0]],
    }));
    assert.equal(singleExpected.status, 400);

    const extraAssetPath = `conversations/${JOB}/extra.webp`;
    const threeExpected = await call(`/content/drafts/${DRAFT}/review`, post({
      ...approval,
      expectedMedia: [
        ...approval.expectedMedia,
        { id: OTHER_MEDIA, role: "after", revision: createHash("sha256").update(extraAssetPath).digest("hex") },
      ],
    }));
    assert.equal(threeExpected.status, 400, "reviewing draft with 3 expectedMedia must be rejected with 400");

    const twoBefore = await call(`/content/drafts/${DRAFT}/review`, post({
      ...approval,
      expectedMedia: [
        { id: BEFORE, role: "before", revision: approvedMedia[0]?.revision ?? "" },
        { id: AFTER, role: "before", revision: approvedMedia[1]?.revision ?? "" },
      ],
    }));
    assert.equal(twoBefore.status, 400, "reviewing draft with two before photos must be rejected with 400");
    assert.equal(calls.some((request) => request.path === "/rest/v1/rpc/review_content_draft"), false);
  });

  // Publishing now exists (odd/tasks/owner-meta-publishing.md S3); without the META_* settings it stays off.
  it("does not publish while Facebook and Instagram are not configured", async () => {
    const { call, calls } = setup(() => ({ body: {} }));
    const response = await call(`/content/drafts/${DRAFT}/publish`, { method: "POST" });
    assert.equal(response.status, 503);
    assert.equal(calls.length, 0);
  });

  it("maps database policy failures without returning database internals", async () => {
    const { call } = setup((request) => request.path === "/rest/v1/rpc/owner_content_sources"
      ? { body: [source] }
      : pgError("42501", "policy detail should not be exposed"));
    const original = console.error;
    console.error = () => {};
    try {
      const response = await call("/content/drafts", post({
        sourceJobId: JOB,
        sourceMediaIds: [BEFORE, AFTER],
        title: "Bathroom leak repair",
        caption: "A completed repair.",
        slides,
        platforms: ["instagram"],
      }));
      assert.equal(response.status, 403);
      assert.doesNotMatch(JSON.stringify(await response.json()), /policy detail/);
    } finally {
      console.error = original;
    }
  });
});

describe("Story Pack persistence and selected-photo eligibility", () => {
  const replacement = { ...source.assets[1]!, id: OTHER_MEDIA, storagePath: `conversations/${JOB}/replacement.webp` };
  const missingAfter = { ...source, assets: [source.assets[0]!, replacement] };
  const reclassifiedAfter = { ...source, assets: [source.assets[0]!, { ...source.assets[1]!, role: "before" }, replacement] };
  const approved = { ...draftRow, approved_media: approvedMedia, status: "approved", reviewed_at: "2026-10-30T00:00:00.000Z" };
  const signReply = { body: source.assets.map((asset) => ({ path: asset.storagePath, signedURL: `/object/sign/media/${asset.id}?token=fresh`, error: null })) };

  it("checks the exact draft job even when it is outside the 100-source picker", async () => {
    const { call, calls } = setup((request) => {
      if (request.path === "/rest/v1/rpc/owner_content_sources") {
        return { body: (request.body as { p_job_ids?: string[] }).p_job_ids?.includes(JOB) ? [source] : [] };
      }
      if (request.path === "/rest/v1/content_drafts") return { body: request.query.has("id") ? approved : [approved] };
      if (request.path === "/storage/v1/object/sign/media") return signReply;
      return { status: 500, body: {} };
    });
    const listed = await call("/content/drafts");
    assert.equal(listed.status, 200);
    assert.equal(((await listed.json()) as { data: { canHandoff: boolean }[] }).data[0]?.canHandoff, true);
    assert.equal((await call(`/content/drafts/${DRAFT}/handoff`, post({}))).status, 200);
    assert.ok(calls.filter(r => r.path === "/rest/v1/rpc/owner_content_sources")
      .every(r => (r.body as { p_job_ids?: string[] }).p_job_ids?.includes(JOB)));
  });

  it("lets the atomic review RPC decide eligibility without duplicate source scans", async () => {
    const { call, calls } = setup(request => {
      if (request.path === "/rest/v1/content_drafts") return { body: draftRow };
      if (request.path === "/rest/v1/rpc/review_content_draft") return { body: approved };
      return { status: 500, body: {} };
    });
    const response = await call(`/content/drafts/${DRAFT}/review`, post(approval));
    assert.equal(response.status, 200);
    const data = ((await response.json()) as { data: { status: string; canHandoff: boolean } }).data;
    assert.equal(data.status, "approved");
    assert.equal(data.canHandoff, false, "fresh handoff availability comes from the subsequent refresh or handoff request");
    assert.equal(calls.filter(request => request.path === "/rest/v1/rpc/owner_content_sources").length, 0);
    assert.equal(calls.filter(request => request.path === "/rest/v1/rpc/review_content_draft").length, 1);
  });

  it("persists three edited slides and selected media across a fresh client", async () => {
    let stored = structuredClone(draftRow);
    const respond = (request: FakeCall): FakeReply => {
      if (request.path === "/rest/v1/rpc/owner_content_sources") return { body: [source] };
      if (request.path === "/rest/v1/content_drafts" && request.method === "PATCH") {
        stored = { ...stored, ...(request.body as object) };
        return { body: stored };
      }
      return { body: [stored] };
    };
    const edited = slides.map((slide, i) => ({ ...slide, title: `Edited ${i + 1}`, body: `Saved body ${i + 1}` }));
    assert.equal((await setup(respond).call(`/content/drafts/${DRAFT}`, patchDraft({ slides: edited, expectedUpdatedAt: draftRow.updated_at }))).status, 200);
    const response = await setup(respond).call("/content/drafts");
    assert.equal(response.status, 200);
    const body = await response.json() as { data: { slides: unknown; sourceMediaIds: string[] }[] };
    assert.deepEqual(body.data[0]?.slides, edited);
    assert.deepEqual(body.data[0]?.sourceMediaIds, [BEFORE, AFTER]);
  });

  for (const [label, current] of [["removed after with another available", [missingAfter]], ["reclassified after with another available", [reclassifiedAfter]], ["revoked consent", []]] as const) {
    it(`blocks list and handoff after ${label}`, async () => {
      const { call, calls } = setup((request) => {
        if (request.path === "/rest/v1/rpc/owner_content_sources") return { body: current };
        if (request.path === "/rest/v1/content_drafts") return { body: request.query.has("id") ? approved : [approved] };
        return { status: 500, body: {} };
      });
      const listed = await call("/content/drafts");
      assert.equal(listed.status, 200);
      assert.equal(((await listed.json()) as { data: { canHandoff: boolean }[] }).data[0]?.canHandoff, false);
      assert.equal((await call(`/content/drafts/${DRAFT}/handoff`, post({}))).status, 422);
      assert.equal(calls.some((r) => r.path.startsWith("/storage/")), false);
    });
  }

  it("returns the database rejection of a stale selected pair", async () => {
    const { call, calls } = setup(request => request.path === "/rest/v1/content_drafts"
      ? { body: draftRow } : pgError("23514", "The source photos changed."));
    assert.equal((await call(`/content/drafts/${DRAFT}/review`, post(approval))).status, 422);
    assert.equal(calls.some(r => r.path === "/rest/v1/rpc/review_content_draft"), true);
    assert.equal(calls.some(r => r.path === "/rest/v1/rpc/owner_content_sources"), false);
  });

  it("hands off only approved selected images with fresh links and persisted copy", async () => {
    const { call, calls } = setup((r) => {
      if (r.path === "/rest/v1/rpc/owner_content_sources") return { body: [{ ...source, assets: [...source.assets, replacement] }] };
      if (r.path === "/rest/v1/content_drafts") return { body: approved };
      if (r.path === "/storage/v1/object/sign/media") return signReply;
      return { status: 500, body: {} };
    });
    const response = await call(`/content/drafts/${DRAFT}/handoff`, post({}));
    assert.equal(response.status, 200);
    const body = await response.json() as { data: { draft: { slides: unknown; canHandoff: boolean }; source: { assets: { id: string; imageUrl: string }[] } } };
    assert.deepEqual(body.data.draft.slides, slides);
    assert.equal(body.data.draft.canHandoff, true);
    assert.deepEqual(body.data.source.assets.map((a) => a.id), [BEFORE, AFTER]);
    assert.ok(body.data.source.assets.every((a) => a.imageUrl.includes("token=fresh")));
    assert.deepEqual((calls.find((r) => r.path === "/storage/v1/object/sign/media")?.body as { paths: string[] }).paths, source.assets.map((a) => a.storagePath));
  });

  it("blocks handoff if sources become ineligible during signing", async () => {
    let reads = 0;
    const { call } = setup((r) => {
      if (r.path === "/rest/v1/rpc/owner_content_sources") return { body: ++reads === 1 ? [source] : [] };
      if (r.path === "/rest/v1/content_drafts") return { body: approved };
      if (r.path === "/storage/v1/object/sign/media") return signReply;
      return { status: 500, body: {} };
    });
    assert.equal((await call(`/content/drafts/${DRAFT}/handoff`, post({}))).status, 422);
  });

  it("requires approval and a platform before handoff", async () => {
    for (const row of [draftRow, { ...approved, platforms: [] }]) {
      const { call } = setup((r) => r.path === "/rest/v1/content_drafts" ? { body: row } : { body: [source] });
      assert.equal((await call(`/content/drafts/${DRAFT}/handoff`, post({}))).status, 422);
    }
  });

  for (const [label, changedSource] of [
    ["selected after removed", missingAfter],
    ["selected after reclassified", reclassifiedAfter],
    ["selected path replaced", { ...source, assets: [source.assets[0]!, { ...source.assets[1]!, storagePath: "new/path.webp" }] }],
  ] as const) {
    it(`rejects handoff when ${label} during signing`, async () => {
      let reads = 0;
      const { call } = setup((request) => {
        if (request.path === "/rest/v1/rpc/owner_content_sources") return { body: [++reads === 1 ? source : changedSource] };
        if (request.path === "/rest/v1/content_drafts") return { body: approved };
        if (request.path === "/storage/v1/object/sign/media") return signReply;
        return { status: 500, body: {} };
      });
      assert.equal((await call(`/content/drafts/${DRAFT}/handoff`, post({}))).status, 422);
    });
  }

  it("requires the displayed version and forwards its exact approval snapshot", async () => {
    const { call, calls } = setup((request) => {
      if (request.path === "/rest/v1/content_drafts") return { body: draftRow };
      if (request.path === "/rest/v1/rpc/owner_content_sources") return { body: [source] };
      if (request.path === "/rest/v1/rpc/review_content_draft") {
        return (request.body as { p_expected_updated_at: string }).p_expected_updated_at === approval.expectedUpdatedAt
          ? { body: approved } : pgError("PT409", "The draft changed.", 409);
      }
      return { status: 500, body: {} };
    });
    assert.equal((await call(`/content/drafts/${DRAFT}/review`, post({ approve: true }))).status, 400);
    assert.equal((await call(`/content/drafts/${DRAFT}/review`, post({ ...approval, expectedUpdatedAt: "2026-10-28T00:00:00Z" }))).status, 409);
    assert.equal(calls.filter(r => r.path === "/rest/v1/rpc/review_content_draft").length, 1);
    assert.equal((await call(`/content/drafts/${DRAFT}/review`, post(approval))).status, 200);
    assert.deepEqual(calls.filter(r => r.path === "/rest/v1/rpc/review_content_draft").at(-1)?.body,
      { p_draft_id: DRAFT, p_approve: true, p_expected_updated_at: approval.expectedUpdatedAt, p_expected_media: approvedMedia });
  });

  it("invalidates approval after the same selected ids swap before/after roles", async () => {
    const swapped = { ...source, assets: source.assets.map(asset => ({ ...asset, role: asset.role === "before" ? "after" : "before" })) };
    const { call } = setup(request => request.path === "/rest/v1/content_drafts"
      ? { body: request.query.has("id") ? approved : [approved] } : { body: [swapped] });
    const listed = await call("/content/drafts");
    assert.equal(((await listed.json()) as { data: { canHandoff: boolean }[] }).data[0]?.canHandoff, false);
    assert.equal((await call(`/content/drafts/${DRAFT}/handoff`, post({}))).status, 422);
  });

  it("does not approve legacy copy or an empty platform selection", async () => {
    for (const row of [{ ...draftRow, slides: null }, { ...draftRow, platforms: [] }]) {
      const { call, calls } = setup((request) => request.path === "/rest/v1/content_drafts" ? { body: row } : pgError("23514", "Complete copy and platform required."));
      assert.equal((await call(`/content/drafts/${DRAFT}/review`, post(approval))).status, 422);
      assert.equal(calls.some((r) => r.path === "/rest/v1/rpc/review_content_draft"), true);
    }
  });

  it("saves a draft before a platform is chosen", async () => {
    const { call, calls } = setup(() => ({ body: { ...draftRow, platforms: [] } }));
    const response = await call(`/content/drafts/${DRAFT}`, patchDraft({ platforms: [], expectedUpdatedAt: draftRow.updated_at }));
    assert.equal(response.status, 200);
    assert.deepEqual(calls[0]?.body, { platforms: [] });
    assert.equal(((await response.json()) as { data: { canHandoff: boolean } }).data.canHandoff, false);
  });

  it("uses a stable asset revision across URL refreshes and changes it for replaced paths", async () => {
    const load = async (afterPath: string, token: string) => {
      const current = { ...source, assets: [source.assets[0]!, { ...source.assets[1]!, storagePath: afterPath, revision: createHash("sha256").update(afterPath).digest("hex") }] };
      const { call } = setup((request) => {
        if (request.path === "/rest/v1/rpc/owner_content_sources") return { body: [current] };
        if (request.path === "/rest/v1/content_drafts") return { body: { ...approved, approved_media: current.assets.map(asset => ({ id: asset.id, role: asset.role, revision: createHash("sha256").update(asset.storagePath).digest("hex") })) } };
        if (request.path === "/storage/v1/object/sign/media") return { body: current.assets.map((asset) => ({
          path: asset.storagePath, signedURL: `/object/sign/media/${asset.id}?token=${token}`, error: null,
        })) };
        return { status: 500, body: {} };
      });
      const response = await call(`/content/drafts/${DRAFT}/handoff`, post({}));
      assert.equal(response.status, 200);
      return ((await response.json()) as { data: { source: { assets: { id: string; revision: string; imageUrl: string }[] } } }).data.source.assets;
    };
    const first = (await load(source.assets[1]!.storagePath, "one"))[1]!;
    const refreshed = (await load(source.assets[1]!.storagePath, "two"))[1]!;
    const replaced = (await load("conversations/replaced-after.webp", "three"))[1]!;
    assert.equal(first.revision, refreshed.revision);
    assert.notEqual(first.imageUrl, refreshed.imageUrl);
    assert.notEqual(first.revision, replaced.revision);
    assert.equal(first.id, replaced.id);
    assert.match(first.revision, /^[a-f0-9]{64}$/);
    assert.doesNotMatch(first.revision, /conversations/);
  });

  it("does not hand off partially signed media", async () => {
    const { call } = setup((request) => {
      if (request.path === "/rest/v1/rpc/owner_content_sources") return { body: [source] };
      if (request.path === "/rest/v1/content_drafts") return { body: approved };
      if (request.path === "/storage/v1/object/sign/media") return { body: [signReply.body[0]] };
      return { status: 500, body: {} };
    });
    assert.equal((await call(`/content/drafts/${DRAFT}/handoff`, post({}))).status, 422);
  });

  it("rejects incomplete and oversized slide content", async () => {
    const { call } = setup(() => ({ body: {} }));
    for (const invalid of [slides.slice(0, 2), [{ ...slides[0], title: "x".repeat(61) }, ...slides.slice(1)]]) {
      assert.equal((await call(`/content/drafts/${DRAFT}`, patchDraft({ slides: invalid, expectedUpdatedAt: draftRow.updated_at }))).status, 400);
    }
  });

  it("treats a draft with 3 media ids as ineligible for handoff", async () => {
    const extraAssetPath = `conversations/${JOB}/extra.webp`;
    const extraMedia = {
      id: OTHER_MEDIA,
      role: "after" as const,
      storagePath: extraAssetPath,
      thumbPath: null,
      revision: createHash("sha256").update(extraAssetPath).digest("hex"),
    };
    const threeMediaJob = { ...source, assets: [...source.assets, extraMedia] };
    const draftWithThreeMedia = {
      ...draftRow,
      source_media_ids: [BEFORE, AFTER, OTHER_MEDIA],
      status: "approved",
      approved_media: [
        ...approvedMedia,
        { id: OTHER_MEDIA, role: "after" as const, revision: extraMedia.revision },
      ],
    };

    const { call } = setup((request) => {
      if (request.path === "/rest/v1/rpc/owner_content_sources") return { body: [threeMediaJob] };
      if (request.path === "/rest/v1/content_drafts") return { body: request.query.has("id") ? draftWithThreeMedia : [draftWithThreeMedia] };
      return { status: 500, body: {} };
    });

    const listed = await call("/content/drafts");
    assert.equal(listed.status, 200);
    const listedData = await listed.json() as { data: { canHandoff: boolean }[] };
    assert.equal(listedData.data[0]?.canHandoff, false, "draft with 3 media ids must not be eligible for handoff");

    const handoffResponse = await call(`/content/drafts/${DRAFT}/handoff`, post({}));
    assert.equal(handoffResponse.status, 422, "handoff for draft with 3 media ids must return 422");
  });
});

describe("S9: Logical delete of Story Pack drafts", () => {
  const DELETED_DRAFT = "d0000000-0000-4000-8000-000000000099";
  const deletedDraftRow = {
    ...draftRow,
    id: DELETED_DRAFT,
    source_job_id: null,
    deleted_at: "2026-10-30T12:00:00.000Z",
  };

  it("filters deleted_at is null when listing drafts and excludes rows with deleted_at set", async () => {
    const { call, calls } = setup((request) => {
      if (request.path === "/rest/v1/rpc/owner_content_sources") return { body: [source] };
      if (request.path === "/rest/v1/content_drafts" && request.method === "GET") {
        if (request.query.get("deleted_at") === "is.null") {
          return { body: [draftRow] };
        }
        return { body: [draftRow, deletedDraftRow] };
      }
      return { status: 500, body: {} };
    });

    const response = await call("/content/drafts");
    assert.equal(response.status, 200);

    const listQuery = calls.find((r) => r.path === "/rest/v1/content_drafts" && r.method === "GET");
    assert.equal(listQuery?.query.get("deleted_at"), "is.null", "list query must filter deleted_at=is.null");

    const body = await response.json() as { data: { id: string }[] };
    assert.equal(body.data.some((d) => d.id === DELETED_DRAFT), false, "a row returned with deleted_at set must not be listed");
  });

  it("rejects PATCH on a logically deleted draft with 404 not_found and filters deleted_at is null", async () => {
    const { call, calls } = setup((request) => {
      if (request.path === "/rest/v1/content_drafts" && request.method === "PATCH") {
        if (request.query.get("deleted_at") === "is.null") {
          return pgError("PGRST116", "JSON object requested, multiple (or no) rows returned", 406);
        }
        return { body: deletedDraftRow };
      }
      return { status: 500, body: {} };
    });

    const response = await call(`/content/drafts/${DELETED_DRAFT}`, patchDraft({ caption: "Edited repair story.", expectedUpdatedAt: draftRow.updated_at }));
    const patchCall = calls.find((r) => r.path === "/rest/v1/content_drafts" && r.method === "PATCH");
    assert.equal(patchCall?.query.get("deleted_at"), "is.null", "PATCH must query with deleted_at=is.null");
    assert.equal(response.status, 404, "PATCH on logically deleted draft must return 404");
    const body = await response.json() as { error?: { code: string } };
    assert.equal(body.error?.code, "not_found");
  });

  it("rejects review on a logically deleted draft with 404 not_found and filters deleted_at is null", async () => {
    const { call, calls } = setup((request) => {
      if (request.path === "/rest/v1/content_drafts" && request.method === "GET") {
        if (request.query.get("deleted_at") === "is.null") {
          return pgError("PGRST116", "JSON object requested, multiple (or no) rows returned", 406);
        }
        return { body: { ...draftRow, id: DELETED_DRAFT, deleted_at: "2026-10-30T12:00:00.000Z" } };
      }
      if (request.path === "/rest/v1/rpc/review_content_draft") {
        return { body: { ...draftRow, id: DELETED_DRAFT, status: "approved" } };
      }
      return { status: 500, body: {} };
    });

    const response = await call(`/content/drafts/${DELETED_DRAFT}/review`, post(approval));
    const selectCall = calls.find((r) => r.path === "/rest/v1/content_drafts" && r.method === "GET");
    assert.equal(selectCall?.query.get("deleted_at"), "is.null", "review lookup must query with deleted_at=is.null");
    assert.equal(response.status, 404, "review on logically deleted draft must return 404");
    const body = await response.json() as { error?: { code: string } };
    assert.equal(body.error?.code, "not_found");
    assert.equal(calls.some((r) => r.path === "/rest/v1/rpc/review_content_draft"), false, "review RPC must not be called for logically deleted draft");
  });

  it("rejects handoff on a logically deleted draft with 404 not_found and filters deleted_at is null", async () => {
    const approvedDeleted = {
      ...draftRow,
      id: DELETED_DRAFT,
      status: "approved",
      approved_media: approvedMedia,
      deleted_at: "2026-10-30T12:00:00.000Z",
    };
    const { call, calls } = setup((request) => {
      if (request.path === "/rest/v1/content_drafts" && request.method === "GET") {
        if (request.query.get("deleted_at") === "is.null") {
          return pgError("PGRST116", "JSON object requested, multiple (or no) rows returned", 406);
        }
        return { body: approvedDeleted };
      }
      if (request.path === "/rest/v1/rpc/owner_content_sources") return { body: [source] };
      return { status: 500, body: {} };
    });

    const response = await call(`/content/drafts/${DELETED_DRAFT}/handoff`, post({}));
    const selectCall = calls.find((r) => r.path === "/rest/v1/content_drafts" && r.method === "GET");
    assert.equal(selectCall?.query.get("deleted_at"), "is.null", "handoff lookup must query with deleted_at=is.null");
    assert.equal(response.status, 404, "handoff on logically deleted draft must return 404");
    const body = await response.json() as { error?: { code: string } };
    assert.equal(body.error?.code, "not_found");
  });
});

describe("Story Pack optimistic updates", () => {
  it("writes only the displayed version and rejects stale copy without overwriting", async () => {
    let stored = { ...draftRow };
    const { call, calls } = setup((request) => {
      if (request.path !== "/rest/v1/content_drafts") return { status: 500, body: {} };
      if (request.method === "GET") return { body: stored };
      if (request.method !== "PATCH") return { status: 500, body: {} };
      if (request.query.get("updated_at") !== `eq.${stored.updated_at}`) return { body: null };
      stored = { ...stored, ...(request.body as object), updated_at: "2026-10-31T01:00:00.000Z" };
      return { body: stored };
    });
    const first = await call(`/content/drafts/${DRAFT}`, patchDraft({ caption: "First writer", expectedUpdatedAt: draftRow.updated_at }));
    assert.equal(first.status, 200);
    assert.deepEqual(calls[0]?.body, { caption: "First writer" });
    assert.equal(calls[0]?.query.get("source"), "eq.story_pack");
    assert.equal(calls[0]?.query.get("status"), "eq.draft");
    assert.equal(calls[0]?.query.get("deleted_at"), "is.null");
    const stale = await call(`/content/drafts/${DRAFT}`, patchDraft({ caption: "Stale writer", expectedUpdatedAt: draftRow.updated_at }));
    assert.equal(stale.status, 409);
    assert.equal((await stale.json() as { error: { code: string } }).error.code, "changed_since_read");
    assert.equal(stored.caption, "First writer");
  });

  it("rejects unversioned edits before any database access", async () => {
    const { call, calls } = setup(() => ({ body: draftRow }));
    assert.equal((await call(`/content/drafts/${DRAFT}`, patchDraft({ caption: "Unversioned" }))).status, 400);
    assert.equal(calls.length, 0);
  });

  it("keeps missing or logically deleted rows unavailable after a conditional write misses", async () => {
    const { call, calls } = setup(() => ({ body: null }));
    const response = await call(`/content/drafts/${DRAFT}`, patchDraft({ caption: "Must not resurrect", expectedUpdatedAt: draftRow.updated_at }));
    assert.equal(response.status, 404);
    assert.equal((await response.json() as { error: { code: string } }).error.code, "not_found");
    assert.ok(calls.every((request) => request.query.get("source") === "eq.story_pack"));
    assert.ok(calls.every((request) => request.query.get("deleted_at") === "is.null"));
  });
});
