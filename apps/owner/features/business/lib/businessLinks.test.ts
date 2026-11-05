// Spec: odd/tasks/owner-notification-test-zukki.md T2 (S5, S7). Where the Business
// rows send the owner: Test Zukki opens business/test, and both source-line fix
// actions open the price editor. Sources: HANDOFF-RN-UI.md l.268 and OwTestZukki
// (both actions link OwPrices).
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { businessLinks } from "./businessLinks.ts";

describe("businessLinks", () => {
  it("sends the Test Zukki row to business/test", () => {
    assert.equal(businessLinks.testZukki, "business/test");
  });

  it("sends the Edit prices and Add a service actions to the price editor", () => {
    assert.equal(businessLinks.prices, "business/prices");
  });

  it("sends the Hours row to the hours editor", () => {
    assert.equal(businessLinks.hours, "business/hours");
  });
});
