// Spec: odd/tasks/owner-business-live.md S2: the countdown maximum is the
// offer's own window (expiresAt minus offeredAt), not a fixed demo number.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { offerWindowSeconds } from "./countdown.ts";

describe("offerWindowSeconds", () => {
  it("gives the demo urgent offer its 5 minute window", () => {
    assert.equal(offerWindowSeconds({ offeredAt: "2026-10-28T00:05:00-05:00", expiresAt: "2026-10-28T00:10:00-05:00" }), 300);
  });

  it("gives a business's own 45 minute window, across time zones", () => {
    assert.equal(offerWindowSeconds({ offeredAt: "2026-10-28T05:00:00.000Z", expiresAt: "2026-10-28T00:45:00-05:00" }), 2700);
  });

  it("never reads a negative window", () => {
    assert.equal(offerWindowSeconds({ offeredAt: "2026-10-28T05:10:00.000Z", expiresAt: "2026-10-28T05:00:00.000Z" }), 0);
  });
});
