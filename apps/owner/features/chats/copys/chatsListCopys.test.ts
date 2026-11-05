// Spec: odd/tasks/live-owner-core.md, T3, S5: verbatim strings from OwChats.dc.html. The empty state is not
// in the design (HANDOFF-RN-UI.md section 8 asks for one): pinned for existence only until the text is approved.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { chatsListCopys } from "./chatsListCopys.ts";

const verbatimCopys = {
  chatsTitle: "Chats",
  searchChats: "Search chats",
  youPrefix: "You:",
  yesterday: "Yesterday",
  waitingForYou: "waiting for you",
  quoteSent: "quote sent",
  done: "done",
  visit: "visit",
  footnote: "Customers write to Zukki on WhatsApp. Your replies reach them with your business name.",
};

describe("chatsListCopys", () => {
  for (const [key, text] of Object.entries(verbatimCopys)) {
    it(`${key} is "${text}"`, () => {
      assert.equal(chatsListCopys[key as keyof typeof chatsListCopys], text);
    });
  }

  it("has a non-empty empty state", () => {
    assert.ok(chatsListCopys.emptyChats.length > 0);
  });
});
