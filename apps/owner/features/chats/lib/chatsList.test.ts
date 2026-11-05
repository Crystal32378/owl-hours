// Spec: the Chats tab list state (review follow-up of live-owner/2-chats): loading, then
// failed with a retry; a failed reload keeps the rows already shown.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { Conversation } from "../../../shared/data/types.ts";
import { chatsListOf, loadedAfterFailure } from "./chatsList.ts";

const NOW = "2026-10-28T00:10:00-05:00";

const ana: Conversation = {
  id: "c1",
  offerId: "h1",
  customerName: "Ana L.",
  jobTitle: "Leaking toilet",
  statusLine: "waiting for you",
  lastMessage: { id: "m1", from: "customer", text: "Hi", sentAt: "2026-10-28T00:07:00-05:00" },
  unread: 1,
};

describe("chatsListOf", () => {
  it("draws nothing while the first load runs", () => {
    assert.deepEqual(chatsListOf("loading", NOW, () => {}), { status: "loading" });
  });

  it("offers a retry that reloads when the first load failed", async () => {
    let reloads = 0;
    const list = chatsListOf("failed", NOW, () => reloads++);

    assert.equal(list.status, "failed");
    if (list.status === "failed") await list.retry();
    assert.equal(reloads, 1);
  });

  it("maps each loaded conversation to a row", () => {
    const list = chatsListOf([ana], NOW, () => {});

    assert.equal(list.status, "ready");
    assert.deepEqual(list.status === "ready" ? list.rows.map((row) => [row.id, row.timestamp]) : [], [["c1", "12:07 AM"]]);
  });
});

describe("loadedAfterFailure", () => {
  it("fails the list when nothing was shown yet", () => {
    assert.equal(loadedAfterFailure("loading"), "failed");
  });

  it("keeps the rows already shown when a reload fails", () => {
    assert.deepEqual(loadedAfterFailure([ana]), [ana]);
  });
});
