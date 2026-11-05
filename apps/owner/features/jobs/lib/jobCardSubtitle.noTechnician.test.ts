// A live approved job can have no technician yet (the API answers null): the card skips the empty
// part instead of reading "Lucía · · $90–140".
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { anaJob } from "../../../shared/data/mock.ts";
import { jobCardSubtitle } from "./jobCardSubtitle.ts";

describe("jobCardSubtitle without a technician", () => {
  it('reads "Lucía · $90–140" for an approved job with no technician', () => {
    const lucia = { ...anaJob, customerName: "Lucía", technician: "", quote: { ...anaJob.quote, total: { min: 90, max: 140 } } };
    assert.equal(jobCardSubtitle(lucia), "Lucía · $90–140");
  });
});
