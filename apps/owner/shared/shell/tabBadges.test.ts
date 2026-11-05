// Regression: the tab badges always counted the demo data (1 request, 2 unread) in live mode.
// The counts now come from whatever offers and conversations the services return.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { tabBadgeCounts } from "./tabBadges.ts";

const offer = (status: string) => ({ status });
const conversation = (unread: number) => ({ unread });

describe("tabBadgeCounts", () => {
  it("counts the requests still waiting for an answer", () => {
    const counts = tabBadgeCounts([offer("offered"), offer("accepted"), offer("offered"), offer("expired")], []);
    assert.equal(counts.requests, 2);
  });

  it("adds up the unread messages across chats", () => {
    assert.equal(tabBadgeCounts([], [conversation(2), conversation(0), conversation(3)]).chats, 5);
  });

  it("shows no badge when nothing waits", () => {
    assert.deepEqual(tabBadgeCounts([offer("accepted")], [conversation(0)]), { requests: 0, chats: 0 });
  });
});
