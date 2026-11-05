// Spec: odd/tasks/owner-ui-build.md L37 gap. A screen whose first load is rejected shows its error
// state; a rejected reload keeps what the screen already shows.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { afterFailedLoad } from "./loadState.ts";

describe("afterFailedLoad", () => {
  it("fails a screen that has shown nothing yet", () => {
    assert.equal(afterFailedLoad("loading"), "failed");
  });

  it("stays failed after another failure", () => {
    assert.equal(afterFailedLoad("failed"), "failed");
  });

  it("keeps what the screen already shows", () => {
    const job = { id: "j1" };
    assert.equal(afterFailedLoad(job), job);
  });

  it("keeps a found-nothing answer as it is", () => {
    assert.equal(afterFailedLoad(null), null);
  });
});
