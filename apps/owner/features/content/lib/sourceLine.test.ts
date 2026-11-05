// Tests for pure sourceLine(draft, job) in lib/.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { anaJob, drafts } from "../../../shared/data/mock.ts";
import type { Job, PostDraft } from "../../../shared/data/types.ts";
import { sourceLine } from "./sourceLine.ts";

describe("sourceLine", () => {
  const post91 = drafts.find((d) => d.id === "post_91")!;
  const postNight = drafts.find((d) => d.id === "post_night")!;
  const postPrice = drafts.find((d) => d.id === "post_price")!;

  it("formats job draft with job customer first name", () => {
    const line = sourceLine(post91, anaJob);
    assert.equal(line, "Made from last night's job · Ana agreed to share");
  });

  it("extracts customer first name for another job customer", () => {
    const customJob: Job = {
      ...structuredClone(anaJob),
      customerName: "Carlos M.",
    };
    const line = sourceLine(post91, customJob);
    assert.equal(line, "Made from last night's job · Carlos agreed to share");
  });

  it("names the customer generically when the job has no customer name (live API)", () => {
    const line = sourceLine(post91, { ...structuredClone(anaJob), customerName: "" });
    assert.equal(line, "Made from last night's job · The customer agreed to share");
  });

  it("returns base job sourceLine when job is omitted or null", () => {
    assert.equal(sourceLine(post91), "made from last night's job");
    assert.equal(sourceLine(post91, null), "made from last night's job");
    assert.equal(sourceLine(post91, undefined), "made from last night's job");
  });

  it("returns reminder sourceLine for reminder drafts", () => {
    assert.equal(sourceLine(postNight), "Reminder of your night service and fee");
    assert.equal(sourceLine(postNight, anaJob), "Reminder of your night service and fee");
  });

  it("returns prices sourceLine for prices drafts", () => {
    assert.equal(sourceLine(postPrice), "From your price list");
    assert.equal(sourceLine(postPrice, anaJob), "From your price list");
  });

  it("falls back to default copy for unknown source", () => {
    const unknownDraft = {
      ...structuredClone(post91),
      source: "unknown" as PostDraft["source"],
    };
    assert.equal(sourceLine(unknownDraft), "Made from your jobs and prices");
  });

  it("does not mutate inputs", () => {
    const draftCopy = structuredClone(post91);
    const jobCopy = structuredClone(anaJob);
    sourceLine(draftCopy, jobCopy);
    assert.deepEqual(draftCopy, post91);
    assert.deepEqual(jobCopy, anaJob);
  });
});
