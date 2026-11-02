// The hours editor shows one row per day, Monday first, and saves the shifts PUT /business/hours takes.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isDayValid, toDayDrafts, toShifts } from "./hoursDraft.ts";

const weekdayShift = { weekday: 1, opens: "09:00", closes: "17:00" };

describe("toDayDrafts", () => {
  it("lists the seven days Monday first and Sunday last", () => {
    assert.deepEqual(toDayDrafts([]).map((day) => day.weekday), [1, 2, 3, 4, 5, 6, 0]);
  });

  it("opens a day that has a shift, with its times", () => {
    const [monday] = toDayDrafts([weekdayShift]);

    assert.deepEqual(
      { isOpen: monday?.isOpen, opens: monday?.opens, closes: monday?.closes },
      { isOpen: true, opens: "09:00", closes: "17:00" },
    );
  });

  it("closes a day without a shift and offers default times for when it opens", () => {
    const tuesday = toDayDrafts([weekdayShift])[1];

    assert.deepEqual(
      { isOpen: tuesday?.isOpen, opens: tuesday?.opens, closes: tuesday?.closes },
      { isOpen: false, opens: "08:00", closes: "20:00" },
    );
  });
});

describe("toShifts", () => {
  it("saves open days only", () => {
    assert.deepEqual(toShifts(toDayDrafts([weekdayShift])), [weekdayShift]);
  });

  it("drops a day the owner closed", () => {
    const days = toDayDrafts([weekdayShift]).map((day) => ({ ...day, isOpen: false }));

    assert.deepEqual(toShifts(days), []);
  });

  it("keeps a second shift on a day the owner edits", () => {
    const morning = { weekday: 3, opens: "08:00", closes: "12:00" };
    const evening = { weekday: 3, opens: "16:00", closes: "20:00" };
    const days = toDayDrafts([morning, evening]).map((day) => (day.weekday === 3 ? { ...day, opens: "07:00" } : day));

    assert.deepEqual(toShifts(days), [{ ...morning, opens: "07:00" }, evening]);
  });

  it("drops a second shift when the owner closes that day", () => {
    const morning = { weekday: 3, opens: "08:00", closes: "12:00" };
    const evening = { weekday: 3, opens: "16:00", closes: "20:00" };
    const days = toDayDrafts([morning, evening]).map((day) => (day.weekday === 3 ? { ...day, isOpen: false } : day));

    assert.deepEqual(toShifts(days), []);
  });
});

describe("isDayValid", () => {
  const open = { weekday: 1, isOpen: true, opens: "09:00", closes: "17:00", otherShifts: [] };

  it("accepts a closed day whatever its times say", () => {
    assert.equal(isDayValid({ ...open, isOpen: false, opens: "", closes: "" }), true);
  });

  it("accepts a shift that runs past midnight", () => {
    assert.equal(isDayValid({ ...open, opens: "20:00", closes: "06:00" }), true);
  });

  it("rejects an open day that opens and closes at the same time", () => {
    assert.equal(isDayValid({ ...open, closes: "09:00" }), false);
  });

  it("rejects an open day with a cleared time", () => {
    assert.equal(isDayValid({ ...open, opens: "" }), false);
  });
});
