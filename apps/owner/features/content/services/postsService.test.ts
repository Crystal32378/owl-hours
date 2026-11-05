// Spec: odd/tasks/owner-content.md, S2 and S4 requirements.
// Service tests for posts: draft retrieval, approval round-trip, regeneration guards, and mock isolation.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DEMO_NOW, drafts as mockDrafts } from "../../../shared/data/mock.ts";
import { createFakePostsClient, createPostsService } from "./postsService.ts";

function buildService(now: string = DEMO_NOW) {
  return createPostsService(createFakePostsClient(), { now: () => now });
}

describe("postsService.getDrafts", () => {
  it("returns three initial drafts from the seeded client", async () => {
    const drafts = await buildService().getDrafts();

    assert.equal(drafts.length, 3);
    assert.deepEqual(
      drafts.map((d) => d.id),
      ["post_91", "post_night", "post_price"],
    );
  });
});

describe("postsService.getDraft", () => {
  it("returns the draft for post_91", async () => {
    const draft = await buildService().getDraft("post_91");

    assert.notEqual(draft, null);
    assert.equal(draft?.id, "post_91");
    assert.equal(draft?.title, "Fixed in 91 minutes");
    assert.equal(draft?.status, "draft");
  });

  it("returns null for an unknown id", async () => {
    assert.equal(await buildService().getDraft("nope"), null);
  });
});

describe("postsService.approve round-trip", () => {
  it("approves post_91: leaves drafts and appears as scheduled", async () => {
    const service = buildService();

    const approved = await service.approve("post_91");
    assert.notEqual(approved, null);
    assert.equal(approved?.status, "scheduled");
    assert.equal(approved?.scheduledFor, "2026-10-28T18:00:00-05:00");

    // After approval, the post leaves the drafts
    const remainingDrafts = await service.getDrafts();
    assert.equal(remainingDrafts.length, 2);
    assert.equal(
      remainingDrafts.some((d) => d.id === "post_91"),
      false,
    );
    assert.equal(await service.getDraft("post_91"), null);

    // And appears as scheduled
    const post = await service.getPost("post_91");
    assert.equal(post?.status, "scheduled");
    const scheduled = await service.getScheduled();
    assert.equal(
      scheduled.some((p) => p.id === "post_91"),
      true,
    );
  });

  it("approving a draft without scheduledFor moves it to published", async () => {
    const service = buildService();

    const approved = await service.approve("post_night");
    assert.notEqual(approved, null);
    assert.equal(approved?.status, "published");
    assert.equal(approved?.publishedAt, DEMO_NOW);

    const published = await service.getPublished();
    assert.equal(
      published.some((p) => p.id === "post_night"),
      true,
    );
  });
});

describe("postsService.approve with edits", () => {
  it("keeps the edited caption and the chosen targets", async () => {
    const service = buildService();
    const caption = "Water on the floor at midnight? We come the same night.";
    const targets = { facebook: false, instagram: true };

    const approved = await service.approve("post_91", { caption, targets });

    assert.equal(approved?.caption, caption);
    assert.deepEqual(approved?.targets, targets);
    assert.equal((await service.getPost("post_91"))?.caption, caption);
  });

  it("refuses an approval with no target checked and keeps the draft", async () => {
    const service = buildService();

    const approved = await service.approve("post_91", { targets: { facebook: false, instagram: false } });

    assert.equal(approved, null);
    assert.equal((await service.getDraft("post_91"))?.status, "draft");
  });
});

describe("postsService.getScheduled", () => {
  it("lists an approved post with the scheduled ones until the API marks it published", async () => {
    const approved = { ...mockDrafts[0]!, id: "post_approved", status: "approved" as const };
    const client = { ...createFakePostsClient(), listPosts: async () => [approved] };

    const scheduled = await createPostsService(client, { now: () => DEMO_NOW }).getScheduled();

    assert.deepEqual(scheduled.map((p) => p.id), ["post_approved"]);
  });
});

describe("postsService.getPublished seed", () => {
  it("starts with the demo published post from the OwContent design", async () => {
    const published = await buildService().getPublished();

    assert.deepEqual(
      published.map((p) => p.title),
      ["Water heater installed in one visit"],
    );
  });
});

describe("postsService.regenerate", () => {
  it("offers Regenerate in the demo", () => {
    assert.equal(buildService().canRegenerate, true);
  });

  it("in the demo, each regenerate gives another caption and comes back around", async () => {
    const service = buildService();
    const original = (await service.getDraft("post_91"))?.caption;

    const first = await service.regenerate("post_91");
    const second = await service.regenerate("post_91");

    assert.ok(first?.caption);
    assert.notEqual(first?.caption, original);
    assert.equal(second?.caption, original);
  });

  it("in the demo, reopening a draft starts Regenerate over, because the swapped caption is not saved", async () => {
    const service = buildService();
    const original = (await service.getDraft("post_91"))?.caption;
    await service.regenerate("post_91");

    await service.getDraft("post_91");

    assert.notEqual((await service.regenerate("post_91"))?.caption, original);
  });

  it("gives every demo draft a caption to review", async () => {
    const drafts = await buildService().getDrafts();

    assert.deepEqual(drafts.filter((draft) => !draft.caption).map((draft) => draft.id), []);
  });

  it("returns null when regenerating a non-draft (already scheduled)", async () => {
    const service = buildService();
    await service.approve("post_91");

    assert.equal(await service.regenerate("post_91"), null);
  });

  it("returns null when regenerating an unknown id", async () => {
    const service = buildService();

    assert.equal(await service.regenerate("nope"), null);
  });
});

describe("postsService isolation", () => {
  it("does not mutate the shared mock across service instances", async () => {
    const snapshot = structuredClone(mockDrafts);
    const service = buildService();
    await service.approve("post_91");

    const fresh = buildService();
    const freshDrafts = await fresh.getDrafts();
    assert.equal(freshDrafts.length, 3);
    assert.equal((await fresh.getDraft("post_91"))?.status, "draft");

    assert.equal(
      mockDrafts.find((d) => d.id === "post_91")?.status,
      "draft",
    );
    assert.deepEqual(mockDrafts, snapshot);
  });
});
