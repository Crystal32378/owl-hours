// The line the Linked accounts screen shows when Facebook Login sends the owner back
// (?meta=linked, or ?meta=error&reason=...; odd/tasks/owner-meta-publishing.md S2, S4).
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { linkNotice, loginSessionNotice } from "./linkNotice.ts";

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

// The native app opens Facebook Login in an auth session that resolves with the deep link the
// callback redirected to (D1: expo-web-browser openAuthSessionAsync).
describe("loginSessionNotice", () => {
  it("reads the notice from the deep link the login returned to", () => {
    assert.deepEqual(loginSessionNotice({ type: "success", url: "zukki-owner://content/accounts?meta=linked" }),
      { tone: "success", text: "Facebook and Instagram are connected." });
    assert.equal(loginSessionNotice({ type: "success", url: "zukki-owner://content/accounts?meta=error&reason=no_pages" })?.text,
      "No Facebook Page was shared. Connect again and choose your business Page.");
  });

  it("shows nothing when the owner closed the login", () => {
    assert.equal(loginSessionNotice({ type: "cancel" }), null);
    assert.equal(loginSessionNotice({ type: "dismiss" }), null);
  });

  it("shows nothing for a returned link without a login result", () => {
    assert.equal(loginSessionNotice({ type: "success", url: "zukki-owner://content/accounts" }), null);
  });
});
