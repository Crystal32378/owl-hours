// Spec: odd/tasks/owner-requests-data.md S2. The line under the urgency dot on the request
// detail: who asked and how far away, without a distance nobody measured.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { customerLine } from "./customerLine.ts";

describe("customerLine", () => {
  it("shows the customer and the approximate distance", () => {
    assert.equal(customerLine({ customerName: "Ana L.", distanceKm: 1.2 }), "Ana L. · 1.2 km, approximate");
  });

  it("shows only the customer when the distance is unknown", () => {
    assert.equal(customerLine({ customerName: "Ana L.", distanceKm: null }), "Ana L.");
  });
});
