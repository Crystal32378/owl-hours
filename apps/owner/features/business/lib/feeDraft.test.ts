// Spec: odd/tasks/owner-area-map-fees-dark.md S2. The fee rows of the prices
// screens edit the fees with an amount; "at cost" fees are shown, never edited.
// An empty list draws the empty state; only complete fees are saved.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { ExtraFee } from "../../../shared/data/types.ts";
import { completeFees, editableFees, fixedFees, hasNoFees, isCompleteFee, withSavedFees } from "./feeDraft.ts";

const night: ExtraFee = { id: "f1", label: "Night", amount: 25, window: "10 PM–7 AM", atNight: true };
const weekend: ExtraFee = { id: "f2", label: "Weekend", amount: 15, atNight: false };
const parts: ExtraFee = { id: "f3", label: "Parts", amount: "at_cost" };

describe("editableFees", () => {
  it("edits the fees with an amount, keeping whether each applies at night", () => {
    assert.deepEqual(editableFees([night, weekend, parts]), [
      { id: "f1", label: "Night", amount: 25, atNight: true },
      { id: "f2", label: "Weekend", amount: 15, atNight: false },
    ]);
  });

  it("reads a demo fee with a window and no switch as a night fee", () => {
    const demoNight: ExtraFee = { id: "f1", label: "Night", amount: 25, window: "10 PM–7 AM" };
    const demoWeekend: ExtraFee = { id: "f2", label: "Weekend", amount: 15 };

    assert.deepEqual(editableFees([demoNight, demoWeekend]).map((fee) => fee.atNight), [true, false]);
  });
});

describe("fixedFees", () => {
  it("keeps only the at-cost fees", () => {
    assert.deepEqual(fixedFees([night, weekend, parts]), [parts]);
  });
});

describe("hasNoFees", () => {
  it("is true with no editable and no at-cost fees, so the empty state shows", () => {
    assert.equal(hasNoFees([], []), true);
  });

  it("is false with a fee being edited", () => {
    assert.equal(hasNoFees([{ id: "f-new-1", label: "", amount: 0, atNight: false }], []), false);
  });

  it("is false with only an at-cost fee", () => {
    assert.equal(hasNoFees([], [parts]), false);
  });
});

describe("isCompleteFee", () => {
  it("needs a name and a positive whole amount", () => {
    assert.equal(isCompleteFee({ id: "a", label: "Weekend", amount: 15, atNight: false }), true);
    assert.equal(isCompleteFee({ id: "a", label: "  ", amount: 15, atNight: false }), false);
    assert.equal(isCompleteFee({ id: "a", label: "Weekend", amount: 0, atNight: false }), false);
    assert.equal(isCompleteFee({ id: "a", label: "Weekend", amount: 2.5, atNight: false }), false);
  });
});

describe("completeFees", () => {
  it("trims the names and drops fees left blank or at $0", () => {
    const drafts = [
      { id: "f1", label: " Night ", amount: 25, atNight: true },
      { id: "f-new-1", label: "", amount: 0, atNight: false },
      { id: "f-new-2", label: "Holiday", amount: 0, atNight: false },
    ];

    assert.deepEqual(completeFees(drafts), [{ id: "f1", label: "Night", amount: 25, atNight: true }]);
  });
});

describe("withSavedFees", () => {
  it("replaces the edited fees, keeps the at-cost ones, and a night fee keeps its window", () => {
    const saved = [
      { id: "f1", label: "Late night", amount: 30, atNight: true },
      { id: "f-new-1", label: "Holiday", amount: 20, atNight: false },
    ];

    assert.deepEqual(withSavedFees([night, weekend, parts], saved), [
      { id: "f1", label: "Late night", amount: 30, atNight: true, window: "10 PM–7 AM" },
      { id: "f-new-1", label: "Holiday", amount: 20, atNight: false },
      parts,
    ]);
  });

  it("drops the window of a fee switched off night", () => {
    assert.deepEqual(withSavedFees([night], [{ id: "f1", label: "Night", amount: 25, atNight: false }]), [
      { id: "f1", label: "Night", amount: 25, atNight: false },
    ]);
  });
});
