// Spec: odd/tasks/live-owner-core.md T2 (S3). What the Requests tab shows: the offers still
// waiting for the owner, the earlier ones with their outcome, and which empty state applies.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DEMO_NOW, offers as mockOffers } from "../../../shared/data/mock.ts";
import { requestsListView } from "./requestsList.ts";

const [ana, carlos, grace, tom] = mockOffers;
if (!ana || !carlos || !grace || !tom) throw new Error("the demo seeds four offers");

describe("requestsListView", () => {
  it("shows the demo offer as the card waiting for the owner", () => {
    const view = requestsListView(mockOffers, DEMO_NOW, true);

    assert.deepEqual(view.waiting, [
      {
        id: "req_ana",
        isUrgent: true,
        distanceText: "1.2 km",
        timeLeftText: "4:32 left",
        title: "Leaking toilet, water reaching the hallway",
        subtitle: "Ana L. · suggested quote $130–160",
        thumbUrl: ana.media[0]?.thumbUrl ?? null,
      },
    ]);
  });

  it("lists the earlier offers with Accepted / Missed / Declined", () => {
    const view = requestsListView(mockOffers, DEMO_NOW, true);

    assert.deepEqual(view.earlier, [
      { id: "req_carlos", title: "Kitchen sink clogged", subtitle: "Carlos M. · 2.0 km", statusText: "Accepted" },
      { id: "req_grace", title: "Water heater quote", subtitle: "Grace K. · 3.1 km", statusText: "Missed" },
      { id: "req_tom", title: "Shower leak", subtitle: "Tom B. · 6.4 km", statusText: "Declined" },
    ]);
    assert.equal(view.emptyState, null);
  });

  it("moves an offer whose time ran out to the earlier rows as Missed", () => {
    const view = requestsListView([ana], ana.expiresAt, true);

    assert.deepEqual(view.waiting, []);
    assert.deepEqual(view.earlier.map((row) => [row.id, row.statusText]), [["req_ana", "Missed"]]);
  });

  it("leaves the quote out of the subtitle when Zukki suggested none", () => {
    const view = requestsListView([{ ...ana, suggestedQuote: null }], DEMO_NOW, true);

    assert.equal(view.waiting[0]?.subtitle, "Ana L.");
  });

  it("has no thumbnail when the offer has no media", () => {
    const view = requestsListView([{ ...ana, media: [] }], DEMO_NOW, true);

    assert.equal(view.waiting[0]?.thumbUrl, null);
  });

  // Spec: odd/tasks/owner-requests-data.md S2.
  it("shows no distance on a waiting card when the distance is unknown", () => {
    const view = requestsListView([{ ...ana, distanceKm: null }], DEMO_NOW, true);

    assert.equal(view.waiting[0]?.distanceText, null);
  });

  it("leaves the distance out of an earlier row when it is unknown", () => {
    const view = requestsListView([{ ...carlos, distanceKm: null }], DEMO_NOW, true);

    assert.equal(view.earlier[0]?.subtitle, "Carlos M.");
  });

  it("shows the no-requests empty state when there is nothing to list", () => {
    assert.equal(requestsListView([], DEMO_NOW, true).emptyState, "no-requests");
  });

  it("shows no switch value and no 'not taking' state until the business setting has loaded", () => {
    const view = requestsListView([], DEMO_NOW, null);

    assert.equal(view.isTakingRequests, null);
    assert.equal(view.emptyState, "no-requests");
  });

  it("shows the not-taking empty state when the owner switched requests off", () => {
    assert.equal(requestsListView([carlos, grace, tom], DEMO_NOW, false).emptyState, "not-taking");
  });
});
