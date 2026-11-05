// Spec: odd/tasks/owner-business-live.md S1: the Hours row of a live business
// is composed from its business_hours rows, in the design's wording
// ("Mon–Sat, 8 AM–8 PM", handoff-ui/owner-app/design/html/OwBusiness.dc.html).
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { hoursSummary } from "./hoursSummary.ts";

const day = (weekday: number, opens: string, closes: string) => ({ weekday, opens, closes });

describe("hoursSummary", () => {
  it("joins consecutive days with the same hours, Monday first", () => {
    const monToSat = [1, 2, 3, 4, 5, 6].map((weekday) => day(weekday, "08:00", "20:00"));
    assert.equal(hoursSummary(monToSat), "Mon–Sat, 8 AM–8 PM");
  });

  it("keeps groups with different hours apart and shows minutes when they are not :00", () => {
    const hours = [1, 2, 3, 4, 5].map((weekday) => day(weekday, "08:30", "17:00")).concat(day(6, "09:00", "13:00"));
    assert.equal(hoursSummary(hours), "Mon–Fri, 8:30 AM–5 PM · Sat, 9 AM–1 PM");
  });

  it("puts Sunday last and reads midnight and noon as 12", () => {
    assert.equal(hoursSummary([day(0, "12:00", "00:00"), day(6, "12:00", "00:00")]), "Sat–Sun, 12 PM–12 AM");
  });

  it("splits a run broken by a closed day", () => {
    assert.equal(hoursSummary([day(1, "08:00", "18:00"), day(3, "08:00", "18:00")]), "Mon, 8 AM–6 PM · Wed, 8 AM–6 PM");
  });

  it("reads nothing for a business without hours", () => {
    assert.equal(hoursSummary([]), "");
  });
});
