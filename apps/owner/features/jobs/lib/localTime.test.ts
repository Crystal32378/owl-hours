// The device zone is fixed so the expected instants are exact (Bogotá: UTC-5, no daylight saving).
process.env.TZ = "America/Bogota";

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { localIsoString } from "../../../shared/lib/localIsoString.ts";
import { arrivalInstants, localClockText } from "./localTime.ts";

const jobDay = new Date("2026-10-28T00:07:00-05:00");

describe("localIsoString", () => {
  it("writes the instant in the device's own offset", () => {
    assert.equal(localIsoString(new Date("2026-10-28T05:55:00Z")), "2026-10-28T00:55:00-05:00");
  });
});

describe("localClockText", () => {
  it("reads an API timestamp as the device's wall clock", () => {
    assert.equal(localClockText("2026-10-28T05:55:00+00:00"), "12:55 AM");
  });

  it("is null for a malformed timestamp", () => {
    assert.equal(localClockText("soon"), null);
  });
});

describe("arrivalInstants", () => {
  it("places both display times on the job's day in the device zone", () => {
    assert.deepEqual(arrivalInstants({ from: "12:55 AM", to: "1:25 AM" }, jobDay), {
      from: "2026-10-28T00:55:00-05:00",
      to: "2026-10-28T01:25:00-05:00",
    });
  });

  it("rolls the end past midnight when it reads earlier than the start", () => {
    assert.deepEqual(arrivalInstants({ from: "11:50 PM", to: "12:20 AM" }, jobDay), {
      from: "2026-10-28T23:50:00-05:00",
      to: "2026-10-29T00:20:00-05:00",
    });
  });

  it("reads noon and midnight on the 12-hour clock", () => {
    assert.deepEqual(arrivalInstants({ from: "12:00 PM", to: "12:30 PM" }, jobDay), {
      from: "2026-10-28T12:00:00-05:00",
      to: "2026-10-28T12:30:00-05:00",
    });
  });

  it("is null when a time is not a display time", () => {
    assert.equal(arrivalInstants({ from: "", to: "1:25 AM" }, jobDay), null);
  });
});
