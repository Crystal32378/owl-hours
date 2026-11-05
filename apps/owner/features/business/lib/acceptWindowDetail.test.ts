// Spec: odd/tasks/owner-business-live.md S1: the time-to-accept detail of a
// live business reads its own windows; the demo keeps the OwSettings sentence.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { acceptWindowDetailText } from "./settingsText.ts";

describe("acceptWindowDetailText", () => {
  it("reads the demo windows exactly as the OwSettings design shows them", () => {
    assert.equal(
      acceptWindowDetailText({ urgent: 5, other: 30 }),
      "Urgent: 5 min · other requests: 30 min. Then Zukki asks another business.",
    );
  });

  it("reads a business's own windows", () => {
    assert.equal(
      acceptWindowDetailText({ urgent: 10, other: 45 }),
      "Urgent: 10 min · other requests: 45 min. Then Zukki asks another business.",
    );
  });
});
