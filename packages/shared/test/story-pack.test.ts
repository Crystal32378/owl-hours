import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  STORY_PACK_LIMITS,
  storySlideSchema,
  storyPackCreateSchema,
  storyPackReviewSchema,
} from "../src/story-pack.ts";

const VALID_BEFORE_ID = "60000000-0000-4000-8000-000000000011";
const VALID_AFTER_ID = "60000000-0000-4000-8000-000000000012";
const EXTRA_MEDIA_ID = "60000000-0000-4000-8000-000000000013";
const JOB_ID = "80000000-0000-4000-8000-000000000001";
const REVISION = "a".repeat(64);

const validSlides = [
  { title: "Before repair", body: "Active leak under kitchen sink." },
  { title: "Work done", body: "Replaced faulty shut-off valve." },
  { title: "Contact", body: "Message Northside Plumbing anytime." },
];

const validCreatePayload = {
  sourceJobId: JOB_ID,
  sourceMediaIds: [VALID_BEFORE_ID, VALID_AFTER_ID],
  title: "Kitchen leak repair",
  caption: "Repaired shut-off valve under kitchen sink.",
  slides: validSlides,
  platforms: ["instagram" as const],
};

const validApproval = {
  approve: true,
  expectedUpdatedAt: "2026-10-30T12:00:00.000Z",
  expectedMedia: [
    { id: VALID_BEFORE_ID, role: "before" as const, revision: REVISION },
    { id: VALID_AFTER_ID, role: "after" as const, revision: REVISION },
  ],
};

describe("S6: Story Pack text limits", () => {
  it("exports named constants for slide, caption, and title text limits and enforces them in schemas", () => {
    const limits = STORY_PACK_LIMITS;

    assert.equal(limits.slideTitle, 60);
    assert.equal(limits.slideBody, 280);
    assert.equal(limits.title, 80);
    assert.equal(limits.caption, 2200);

    assert.equal(
      storySlideSchema.safeParse({ title: "a".repeat(limits.slideTitle), body: "valid" }).success,
      true,
    );
    assert.equal(
      storySlideSchema.safeParse({ title: "a".repeat(limits.slideTitle + 1), body: "valid" }).success,
      false,
    );

    assert.equal(
      storySlideSchema.safeParse({ title: "valid", body: "a".repeat(limits.slideBody) }).success,
      true,
    );
    assert.equal(
      storySlideSchema.safeParse({ title: "valid", body: "a".repeat(limits.slideBody + 1) }).success,
      false,
    );

    assert.equal(
      storyPackCreateSchema.safeParse({ ...validCreatePayload, title: "a".repeat(limits.title) }).success,
      true,
    );
    assert.equal(
      storyPackCreateSchema.safeParse({ ...validCreatePayload, title: "a".repeat(limits.title + 1) }).success,
      false,
    );

    assert.equal(
      storyPackCreateSchema.safeParse({ ...validCreatePayload, caption: "a".repeat(limits.caption) }).success,
      true,
    );
    assert.equal(
      storyPackCreateSchema.safeParse({ ...validCreatePayload, caption: "a".repeat(limits.caption + 1) }).success,
      false,
    );
  });
});

describe("S6: Story Pack create media selection", () => {
  it("rejects 1 or 3+ media ids and accepts exactly two ids", () => {
    const singleMedia = { ...validCreatePayload, sourceMediaIds: [VALID_BEFORE_ID] };
    assert.equal(storyPackCreateSchema.safeParse(singleMedia).success, false);

    const threeMedia = { ...validCreatePayload, sourceMediaIds: [VALID_BEFORE_ID, VALID_AFTER_ID, EXTRA_MEDIA_ID] };
    const threeResult = storyPackCreateSchema.safeParse(threeMedia);
    assert.equal(threeResult.success, false, "storyPackCreateSchema must reject 3 media ids");

    const exactlyTwoResult = storyPackCreateSchema.safeParse(validCreatePayload);
    assert.equal(exactlyTwoResult.success, true);
  });
});

describe("S6: Story Pack review expected media", () => {
  it("rejects expectedMedia with 1 or 3+ items and requires exactly one before and one after photo", () => {
    const singleItem = {
      ...validApproval,
      expectedMedia: [validApproval.expectedMedia[0]],
    };
    assert.equal(storyPackReviewSchema.safeParse(singleItem).success, false);

    const threeItems = {
      ...validApproval,
      expectedMedia: [
        ...validApproval.expectedMedia,
        { id: EXTRA_MEDIA_ID, role: "after" as const, revision: REVISION },
      ],
    };
    const threeResult = storyPackReviewSchema.safeParse(threeItems);
    assert.equal(threeResult.success, false, "storyPackReviewSchema must reject 3 expectedMedia items");

    const twoBefore = {
      ...validApproval,
      expectedMedia: [
        { id: VALID_BEFORE_ID, role: "before" as const, revision: REVISION },
        { id: EXTRA_MEDIA_ID, role: "before" as const, revision: REVISION },
      ],
    };
    const twoBeforeResult = storyPackReviewSchema.safeParse(twoBefore);
    assert.equal(twoBeforeResult.success, false, "storyPackReviewSchema must reject two before photos");

    const twoAfter = {
      ...validApproval,
      expectedMedia: [
        { id: VALID_AFTER_ID, role: "after" as const, revision: REVISION },
        { id: EXTRA_MEDIA_ID, role: "after" as const, revision: REVISION },
      ],
    };
    const twoAfterResult = storyPackReviewSchema.safeParse(twoAfter);
    assert.equal(twoAfterResult.success, false, "storyPackReviewSchema must reject two after photos");

    assert.equal(storyPackReviewSchema.safeParse(validApproval).success, true);
  });
});

describe("S6: Story Pack existing schema contracts hold", () => {
  it("accepts valid Story Pack payloads with exactly one before and one after photo", () => {
    assert.equal(storyPackCreateSchema.safeParse(validCreatePayload).success, true);
    assert.equal(storyPackReviewSchema.safeParse(validApproval).success, true);
  });
});

describe("Story Pack optimistic update contract", () => {
  it("requires a displayed version plus at least one editable field", async () => {
    const { storyPackUpdateSchema } = await import("../src/story-pack.ts");
    const expectedUpdatedAt = "2026-10-31T00:00:00.000Z";
    assert.equal(storyPackUpdateSchema.safeParse({ expectedUpdatedAt, caption: "Edited" }).success, true);
    assert.equal(storyPackUpdateSchema.safeParse({ caption: "Edited" }).success, false);
    assert.equal(storyPackUpdateSchema.safeParse({ expectedUpdatedAt }).success, false);
  });
});
