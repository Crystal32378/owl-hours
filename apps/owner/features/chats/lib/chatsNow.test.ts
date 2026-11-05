// The device zone is fixed so the local offset is exact (Bogotá: UTC-5, no daylight saving).
process.env.TZ = "America/Bogota";

// Spec: review follow-up of live-owner/2-chats. Live, the Chats list's "now" is written in the device's
// offset, so a message from last evening reads "Yesterday" on the owner's calendar, not UTC's.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DEMO_NOW } from "../../../shared/data/mock.ts";
import { chatsNowFor } from "./chatsNow.ts";

describe("chatsNowFor", () => {
  it("writes the live wall clock in the device's offset", () => {
    assert.equal(chatsNowFor(true, new Date("2026-11-01T02:30:00.000Z")), "2026-10-31T21:30:00-05:00");
  });

  it("keeps the demo's night when not live", () => {
    assert.equal(chatsNowFor(false, new Date("2026-11-01T02:30:00.000Z")), DEMO_NOW);
  });
});
