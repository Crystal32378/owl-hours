// Spec: docs/HANDOFF-OWNER-APP.md, T5 assignment, test file 3, with operator answers 5 and 6.
// Strings come from handoff-ui/owner-app/design/html/OwQuote.dc.html and OwJob.dc.html; the validation
// message is approved verbatim (answer 5). Copy that names the customer is a function of the first name
// (answer 6); the tests pin the rendered demo strings for "Ana" and 1.2 km.
// The listed keys are every key the quote and job screens will render.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { jobsCopys } from "./jobsCopys.ts";

const expectedCopys = {
  // shared
  backLabel: "Back",
  tryAgain: "Try again",
  // quote modal
  sendAQuote: "Send a quote",
  filledInByZukki: "Filled in by Zukki from your prices. Change anything.",
  estimatedTotal: "Estimated total",
  arrival: "Arrival",
  technician: "Technician",
  note: "Note",
  invalidAmountHint: "Use whole numbers above 0. The first number can't be higher than the second.",
  cancel: "Cancel",
  sendQuote: "Send quote",
  // job detail
  jobTitleBar: "Job",
  viaZukki: "via Zukki",
  approvedBy: "Approved by",
  atTime: "at",
  map: "Map",
  change: "Change",
  quoteLabel: "Quote",
  startTrip: "Start trip",
  imHere: "I'm here",
  finish: "Finish",
  // timeline rows still ahead
  onTheWay: "On the way",
  timelineDone: "Done",
};

describe("jobsCopys", () => {
  for (const [key, text] of Object.entries(expectedCopys)) {
    it(`${key} is "${text}"`, () => {
      assert.equal(jobsCopys[key], text);
    });
  }

  it("has every referenced key", () => {
    const missing = Object.keys(expectedCopys).filter((key) => !(key in jobsCopys));

    assert.deepEqual(missing, []);
  });

  it("has no empty string among the referenced keys", () => {
    for (const key of Object.keys(expectedCopys)) {
      const text = jobsCopys[key] ?? "";

      assert.notEqual(String(text).trim(), "", `${key} is empty`);
    }
  });
});

describe("jobsCopys that name the customer", () => {
  it('approvalNotice("Ana") is "Ana approves it in WhatsApp. Nothing is booked until they do."', () => {
    assert.equal(jobsCopys.approvalNotice("Ana"), "Ana approves it in WhatsApp. Nothing is booked until they do.");
  });

  it('sharedAfterApproved("Ana", 1.2) is "Shared after Ana approved · 1.2 km"', () => {
    assert.equal(jobsCopys.sharedAfterApproved("Ana", 1.2), "Shared after Ana approved · 1.2 km");
  });
});
