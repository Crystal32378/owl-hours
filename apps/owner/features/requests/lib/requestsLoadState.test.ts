// Spec: Unit 1 Requests list must not hide offers when loading fails (S1-S3).
// Pure load state: first failure is "failed" (never an empty list), a reload
// failure keeps the shown rows with refreshFailed, a later success clears it.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { offers as mockOffers } from "../../../shared/data/mock.ts";
import {
  initialRequestsLoadState,
  requestsLoadReducer,
} from "./requestsLoadState.ts";

const [ana, carlos] = mockOffers;
if (!ana || !carlos) throw new Error("the demo seeds at least two offers");

describe("requestsLoadState S1: first load fails", () => {
  it("starts loading", () => {
    assert.deepEqual(initialRequestsLoadState(), { status: "loading" });
  });

  it("a failure before any success is failed, not an empty ready list", () => {
    const failed = requestsLoadReducer(initialRequestsLoadState(), { kind: "failed" });

    assert.deepEqual(failed, { status: "failed" });
  });
});

describe("requestsLoadState S2: reload fails after a successful load", () => {
  it("keeps the shown offers and marks the refresh as failed", () => {
    const ready = requestsLoadReducer(initialRequestsLoadState(), { kind: "loaded", offers: [ana] });

    const stale = requestsLoadReducer(ready, { kind: "failed" });

    assert.deepEqual(stale, { status: "ready", offers: [ana], refreshFailed: true });
  });

  it("a second failure keeps the same offers", () => {
    const ready = requestsLoadReducer(initialRequestsLoadState(), { kind: "loaded", offers: [ana] });
    const stale = requestsLoadReducer(ready, { kind: "failed" });

    const stillStale = requestsLoadReducer(stale, { kind: "failed" });

    assert.deepEqual(stillStale, { status: "ready", offers: [ana], refreshFailed: true });
  });
});

describe("requestsLoadState S3: a success after a failure clears the failure", () => {
  it("a load after the first failure is ready without a refresh flag", () => {
    const failed = requestsLoadReducer(initialRequestsLoadState(), { kind: "failed" });

    const ready = requestsLoadReducer(failed, { kind: "loaded", offers: [ana] });

    assert.deepEqual(ready, { status: "ready", offers: [ana], refreshFailed: false });
  });

  it("a load after a failed refresh replaces the rows and clears the flag", () => {
    const ready = requestsLoadReducer(initialRequestsLoadState(), { kind: "loaded", offers: [ana] });
    const stale = requestsLoadReducer(ready, { kind: "failed" });

    const refreshed = requestsLoadReducer(stale, { kind: "loaded", offers: [ana, carlos] });

    assert.deepEqual(refreshed, { status: "ready", offers: [ana, carlos], refreshFailed: false });
  });
});
