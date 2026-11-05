// Regression: the Profile row the locked businessRows test does not cover.
// Spec: odd/tasks/owner-business.md S2; copy: OwBusiness.dc.html.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { business } from "../../../shared/data/mock.ts";
import { businessRows } from "./businessRows.ts";

describe("businessRows profile", () => {
  it("reads the demo profile exactly as the OwBusiness design shows it", () => {
    assert.equal(businessRows(structuredClone(business)).profile, "Plumber · 4.9 rating · 2 technicians");
  });

  it("tells a business without hours to add them, without the night suffix", () => {
    const withoutHours = { ...structuredClone(business), hours: { summary: "", nightUrgent: true } };

    assert.equal(businessRows(withoutHours).hours, "Add your opening hours");
  });
});
