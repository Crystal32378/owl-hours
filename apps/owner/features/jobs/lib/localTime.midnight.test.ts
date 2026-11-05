// A quote sent before midnight for a window after midnight lands on the next day (verifier blocker 1).
process.env.TZ = "America/Bogota";

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { arrivalInstants } from "./localTime.ts";

describe("arrivalInstants across midnight", () => {
  it("puts a 12:15–1:15 AM window sent at 11:40 PM on the next day", () => {
    const sentAt = new Date("2026-10-30T23:40:00-05:00");
    assert.deepEqual(arrivalInstants({ from: "12:15 AM", to: "1:15 AM" }, sentAt), {
      from: "2026-10-31T00:15:00-05:00",
      to: "2026-10-31T01:15:00-05:00",
    });
  });

  it("keeps a window later the same evening on the same day", () => {
    const sentAt = new Date("2026-10-30T21:00:00-05:00");
    assert.deepEqual(arrivalInstants({ from: "11:50 PM", to: "12:20 AM" }, sentAt), {
      from: "2026-10-30T23:50:00-05:00",
      to: "2026-10-31T00:20:00-05:00",
    });
  });
});
