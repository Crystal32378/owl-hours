// Spec: docs/HANDOFF-OWNER-APP.md, T5.1 assignment, test file 4: every new key exists and is non-empty;
// verbatim strings from the designs OwJobs.dc.html and OwJobDone.dc.html. Copy that names the customer is
// a function of the first name, like T5's approvalNotice. The wording of the out-of-estimate line, the
// reason field and the empty states is NOT in the designs: those keys are pinned for existence only until
// the operator approves the text (open questions Q3 and Q5).
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { jobsCopys } from "./jobsCopys.ts";

const verbatimCopys = {
  // Jobs list
  jobsTitle: "Jobs",
  tonight: "Tonight",
  upcoming: "Upcoming",
  done: "Done",
  tomorrow: "Tomorrow",
  // Finish
  finishTheJob: "Finish the job",
  photos: "Photos",
  before: "Before",
  after: "After",
  addPhoto: "Add",
  total: "Total",
  sharePhotosHint: "For posts. Only used if they say yes.",
  markAsDone: "Mark as done",
};

describe("jobsCopys for the jobs list and finish", () => {
  for (const [key, text] of Object.entries(verbatimCopys)) {
    it(`${key} is "${text}"`, () => {
      assert.equal(jobsCopys[key], text);
    });
  }

  it("has no empty string among the verbatim keys", () => {
    for (const key of Object.keys(verbatimCopys)) {
      assert.notEqual(String(jobsCopys[key] ?? "").trim(), "", `${key} is empty`);
    }
  });
});

describe("jobsCopys that name the customer or a value", () => {
  it('confirmFinalPrice("Ana") is the intro line of the finish screen', () => {
    assert.equal(jobsCopys.confirmFinalPrice("Ana"), "Confirm the final price. Zukki sends Ana the receipt and asks for a review on WhatsApp.");
  });

  it('askToSharePhotos("Ana") is "Ask Ana to share the photos"', () => {
    assert.equal(jobsCopys.askToSharePhotos("Ana"), "Ask Ana to share the photos");
  });

  it('waitingForApproval("Carlos") is "Waiting for Carlos to approve"', () => {
    assert.equal(jobsCopys.waitingForApproval("Carlos"), "Waiting for Carlos to approve");
  });

  it('approvedArrive("12:55 AM") is "Approved · arrive 12:55 AM"', () => {
    assert.equal(jobsCopys.approvedArrive("12:55 AM"), "Approved · arrive 12:55 AM");
  });

  it('withinEstimate("$130–160") is "Within the $130–160 estimate"', () => {
    assert.equal(jobsCopys.withinEstimate("$130–160"), "Within the $130–160 estimate");
  });
});

describe("jobsCopys whose wording awaits approval (existence only)", () => {
  it("outsideEstimate names the estimate it is outside of", () => {
    const text = jobsCopys.outsideEstimate("$130–160");

    assert.ok(text.includes("$130–160"), text);
  });

  for (const key of ["reasonLabel", "emptyTonight", "emptyUpcoming", "emptyDone"]) {
    it(`${key} exists and is not empty`, () => {
      assert.ok(key in jobsCopys, `${key} is missing`);
      assert.notEqual(String(jobsCopys[key] ?? "").trim(), "", `${key} is empty`);
    });
  }
});
