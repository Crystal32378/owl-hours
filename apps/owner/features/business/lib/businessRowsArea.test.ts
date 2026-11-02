// Spec: odd/tasks/owner-area-map-fees-dark.md S1. The Service area row draws the
// business's area on the shared map: centred on the saved area centre with its radius,
// or the world overview while the business has no real location (the demo business
// sits at the (0, 0) placeholder).
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { business } from "../../../shared/data/mock.ts";
import { businessRows } from "./businessRows.ts";

const CANCUN = { lat: 21.1727, lng: -86.8515 };

describe("businessRows service-area map", () => {
  it("S1 centres on the saved area centre with its radius", () => {
    const located = { ...structuredClone(business), area: { center: CANCUN, radiusKm: 8 } };

    const rows = businessRows(located, { areaLabel: "Northside", importedServices: null, hasLocation: true });

    assert.deepEqual(rows.serviceAreaMap, { center: CANCUN, radiusKm: 8 });
  });

  it("S1 shows the overview while the business has no real location", () => {
    const rows = businessRows(structuredClone(business), { areaLabel: "Eastside", importedServices: null, hasLocation: false });

    assert.deepEqual(rows.serviceAreaMap, { center: null, radiusKm: 5 });
  });

  it("S1 shows the overview for the demo business, which sits at the placeholder", () => {
    assert.deepEqual(businessRows(structuredClone(business)).serviceAreaMap, { center: null, radiusKm: 5 });
  });
});
