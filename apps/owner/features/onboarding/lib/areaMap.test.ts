// Spec: odd/tasks/owner-area-map-fees-dark.md, T1, S1. The area step's map centres on
// the business, and shows a neutral overview while the business has no real location.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mapCenter } from "./areaMap.ts";

const CANCUN = { lat: 21.16, lng: -86.85 };

describe("mapCenter", () => {
  it("S1 centres on a saved business location", () => {
    assert.deepEqual(mapCenter("saved", CANCUN), CANCUN);
  });

  it("S1 centres on a preset business location", () => {
    assert.deepEqual(mapCenter("preset", CANCUN), CANCUN);
  });

  it("S1 shows the overview while the location is still missing", () => {
    assert.equal(mapCenter("missing", CANCUN), null);
  });

  it("S1 shows the overview for the (0, 0) placeholder a new business starts at", () => {
    assert.equal(mapCenter("saved", { lat: 0, lng: 0 }), null);
  });
});
