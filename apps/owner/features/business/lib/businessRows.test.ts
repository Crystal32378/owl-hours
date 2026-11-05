// Spec: odd/tasks/owner-business.md S2: row values are derived from the demo
// business: copy as in handoff-ui/owner-app/design/html/OwBusiness.dc.html, data verbatim from
// mock.ts (operator decision, odd/tasks/owner-business.md L2).
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { business } from "../../../shared/data/mock.ts";
import { businessRows } from "./businessRows.ts";

function demoRows() {
  return businessRows(structuredClone(business));
}

describe("businessRows", () => {
  it("reads the hours exactly as the OwBusiness design shows them", () => {
    assert.equal(demoRows().hours, "Mon–Sat, 8 AM–8 PM · urgent jobs at night");
  });

  it("reads the prices exactly as the OwBusiness design shows them", () => {
    assert.equal(demoRows().prices, "Visit $45 · Leak repair from $60 · Unclog a drain from $80");
  });

  it("reads the extra fees exactly as the OwBusiness design shows them", () => {
    assert.equal(demoRows().extraFees, "Night 10 PM–7 AM +$25 · Weekend +$15 · Parts at cost");
  });

  it("reads the service area exactly as the OwBusiness design shows it", () => {
    assert.equal(demoRows().serviceArea, "5 km around Northside");
  });

  it("reads the website exactly as the OwBusiness design shows it", () => {
    assert.equal(demoRows().website, "northside-plumbing.example · 12 services imported");
  });

  it("shows the website alone when no imported-services count is known (live)", () => {
    const rows = businessRows(structuredClone(business), { areaLabel: "Northside", importedServices: null, hasLocation: false });
    assert.equal(rows.website, "northside-plumbing.example");
    const { website: _website, ...withoutWebsite } = structuredClone(business);
    assert.equal(businessRows(withoutWebsite, { areaLabel: "Northside", importedServices: null, hasLocation: false }).website, "");
  });
});
