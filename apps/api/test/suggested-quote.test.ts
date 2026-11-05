import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { suggestedQuote } from "../src/services/suggested-quote.ts";

const northside = [
  { item: "Visit", kind: "callout", min_amount: 45, max_amount: 45, conditions: null },
  { item: "Night fee", kind: "night_fee", min_amount: 25, max_amount: 25, conditions: "10 PM-7 AM" },
  { item: "Leak repair", kind: "repair_range", min_amount: 60, max_amount: 90, conditions: null },
  { item: "Drain unclog", kind: "repair_range", min_amount: 80, max_amount: 120, conditions: null },
];

describe("suggestedQuote", () => {
  it("adds the visit, the cheapest repair and the night fee at night (the seeded $130–160)", () => {
    assert.deepEqual(suggestedQuote(northside, 0), { min: 130, max: 160 });
    assert.deepEqual(suggestedQuote(northside, 22), { min: 130, max: 160 });
    assert.deepEqual(suggestedQuote(northside, 6), { min: 130, max: 160 });
  });

  it("leaves the night fee out during the day", () => {
    assert.deepEqual(suggestedQuote(northside, 7), { min: 105, max: 135 });
    assert.deepEqual(suggestedQuote(northside, 16), { min: 105, max: 135 });
  });

  it("uses whatever lines the business has", () => {
    assert.deepEqual(suggestedQuote([northside[2]!], 16), { min: 60, max: 90 });
  });

  it("suggests nothing without a visit or repair price", () => {
    assert.equal(suggestedQuote([], 16), null);
    assert.equal(suggestedQuote([northside[1]!], 23), null);
  });

  it("charges a night fee with an unreadable window at no hour", () => {
    const rules = [northside[0]!, { ...northside[1]!, conditions: "after dark" }];
    assert.deepEqual(suggestedQuote(rules, 23), { min: 45, max: 45 });
  });
});
