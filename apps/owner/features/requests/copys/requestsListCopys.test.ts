// Spec: odd/tasks/live-owner-core.md T2 (S3). The Requests tab copy, verbatim from
// handoff-ui/owner-app/design/html/OwRequests.dc.html and HANDOFF-RN-UI.md:300-312.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { requestsListCopys } from "./requestsListCopys.ts";

const expectedCopys = {
  title: "Requests",
  takingRequests: "Taking requests",
  waitingForYou: "Waiting for you",
  urgent: "Urgent",
  timeLeft: "left",
  suggestedQuote: "suggested quote",
  reviewRequest: "Review request",
  earlierTonight: "Earlier tonight",
  accepted: "Accepted",
  missed: "Missed",
  declined: "Declined",
  footnote: "Missed and declined requests go to another business. Customers never see why.",
  notTakingTitle: "You're not taking requests",
  notTakingBody: "Zukki won't suggest you until you turn this on.",
  noRequestsTitle: "No requests yet",
  noRequestsBody: "We'll notify you when someone nearby needs you.",
  somethingWentWrong: "Something went wrong.",
  tryAgain: "Try again",
  refreshFailedNotice: "Couldn't refresh. Showing saved requests.",
};

describe("requestsListCopys", () => {
  it("holds exactly the Requests tab copy", () => {
    assert.deepEqual({ ...requestsListCopys }, expectedCopys);
  });
});
