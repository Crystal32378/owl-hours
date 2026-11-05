// The category list must match payload 02's rows exactly
// (CATEGORY_LIST in packages/whatsapp/src/payloads/category-list.ts).
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { CATEGORIES, categoryFromListReply, isCategory } from "../src/categories.ts";

const PAYLOAD_02_ROW_IDS = [
  "cat_plumbing",
  "cat_electrical",
  "cat_locksmith",
  "cat_food",
  "cat_beauty",
  "cat_auto",
  "cat_pets",
  "cat_other",
];

describe("categories", () => {
  it("covers every row of the payload 02 list", () => {
    const ids = PAYLOAD_02_ROW_IDS;
    assert.deepEqual(ids.filter((id) => id !== "cat_other").sort(), CATEGORIES.map((c) => `cat_${c}`).sort());
    for (const id of ids) {
      assert.notEqual(categoryFromListReply(id), null, id);
    }
  });

  it("maps list replies to directory categories", () => {
    assert.equal(categoryFromListReply("cat_plumbing"), "plumbing");
    assert.equal(categoryFromListReply("cat_other"), "other");
    assert.equal(categoryFromListReply("cat_weapons"), null);
    assert.equal(categoryFromListReply("plumbing"), null);
  });

  it("only accepts known categories, matching the database pattern", () => {
    assert.equal(isCategory("food"), true);
    assert.equal(isCategory("other"), false);
    for (const category of CATEGORIES) {
      assert.match(category, /^[a-z_]{2,32}$/);
    }
  });
});
