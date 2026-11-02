// The line the Linked accounts screen shows when Facebook Login sends the owner back
// (?meta=linked, or ?meta=error&reason=...; odd/tasks/owner-meta-publishing.md S2, S4).
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { linkNotice } from "./linkNotice.ts";

describe("linkNotice", () => {
  it("confirms a link", () => {
    assert.deepEqual(linkNotice("linked", undefined), { tone: "success", text: "Facebook and Instagram are connected." });
  });

  it("explains each failure the callback reports", () => {
    assert.equal(linkNotice("error", "denied")?.text, "Facebook Login was cancelled. Nothing was connected.");
    assert.equal(linkNotice("error", "no_pages")?.text,
      "No Facebook Page was shared. Connect again and choose your business Page.");
    assert.equal(linkNotice("error", "forbidden")?.text, "Only the business owner can connect accounts.");
    assert.equal(linkNotice("error", "invalid_state")?.text, "The connection expired. Try again.");
  });

  it("falls back to a generic failure for any other reason", () => {
    assert.deepEqual(linkNotice("error", "meta_error"), { tone: "error", text: "Facebook could not connect. Try again." });
    assert.equal(linkNotice("error", undefined)?.tone, "error");
  });

  it("shows nothing on a normal visit", () => {
    assert.equal(linkNotice(undefined, undefined), null);
    assert.equal(linkNotice("something", "else"), null);
  });
});
