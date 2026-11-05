// Regression: Continue on the prices step saved an unnamed "$0" row and an "ER $0" row
// (Crystal's report, step 2 of 3). Only complete prices leave the draft.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { completePrices } from "./priceDraft.ts";

const visit = { id: "p1", label: "Visit", amount: 45, from: false };

describe("completePrices", () => {
  it("keeps named prices with a positive whole amount", () => {
    assert.deepEqual(completePrices([visit]), [visit]);
  });

  it("drops a row added with no name and no amount", () => {
    assert.deepEqual(completePrices([visit, { id: "p_new_2", label: "", amount: 0, from: false }]), [visit]);
  });

  it("drops a named row whose amount is still $0", () => {
    assert.deepEqual(completePrices([visit, { id: "p_new_2", label: "ER", amount: 0, from: false }]), [visit]);
  });

  it("drops a row whose name is only spaces", () => {
    assert.deepEqual(completePrices([{ id: "p_new_1", label: "   ", amount: 90, from: false }]), []);
  });

  it("trims the name it keeps", () => {
    assert.deepEqual(completePrices([{ id: "p_new_1", label: " Gas leak ", amount: 90, from: false }]), [
      { id: "p_new_1", label: "Gas leak", amount: 90, from: false },
    ]);
  });
});
