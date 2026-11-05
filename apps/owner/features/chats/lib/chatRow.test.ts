// Spec: odd/tasks/live-owner-core.md, T3, S5. One row of the Chats list (OwChats.dc.html): name,
// timestamp, last message (bold with a count when unread) and the "job · status" line; search filters the rows.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DEMO_NOW, conversations } from "../../../shared/data/mock.ts";
import { chatRowOf, chatTimestamp, filterChatRows } from "./chatRow.ts";

const demoRows = conversations.map((conversation) => chatRowOf(conversation, DEMO_NOW));

describe("chatRowOf", () => {
  it("draws Ana's row as the design: 12:07 AM, her last message and the visit line", () => {
    assert.deepEqual(demoRows[0], {
      id: "c_ana",
      name: "Ana L.",
      timestamp: "12:07 AM",
      preview: "Perfect, thank you!",
      unread: 0,
      jobLine: "Leaking toilet · visit 12:55 AM",
    });
  });

  it("keeps Carlos's two unread messages and his waiting line", () => {
    assert.equal(demoRows[1].unread, 2);
    assert.equal(demoRows[1].timestamp, "9:48 PM");
    assert.equal(demoRows[1].jobLine, "Kitchen sink · waiting for you");
  });

  it("prefixes the owner's own last message with 'You:'", () => {
    assert.equal(demoRows[3].preview, "You: Mario can come at 10 AM");
    assert.equal(demoRows[3].timestamp, "Mon");
  });

  it("writes the title alone when the conversation has no status line", () => {
    const row = chatRowOf({ ...conversations[0], statusLine: "" }, DEMO_NOW);

    assert.equal(row.jobLine, "Leaking toilet");
  });
});

describe("chatTimestamp", () => {
  const now = "2026-10-28T00:05:00-05:00"; // a Wednesday

  it("is the clock time within the last 24 hours", () => {
    assert.equal(chatTimestamp("2026-10-27T09:48:00-05:00", now), "9:48 AM");
  });

  it("is 'Yesterday' for an older message on the previous day", () => {
    assert.equal(chatTimestamp("2026-10-27T00:01:00-05:00", now), "Yesterday");
  });

  it("is the weekday within the last week", () => {
    assert.equal(chatTimestamp("2026-10-26T09:00:00-05:00", now), "Mon");
    assert.equal(chatTimestamp("2026-10-22T09:00:00-05:00", now), "Thu");
  });

  it("is the month and day for anything older", () => {
    assert.equal(chatTimestamp("2026-10-20T09:00:00-05:00", now), "Oct 20");
  });
});

describe("filterChatRows", () => {
  it("keeps every row for an empty search", () => {
    assert.equal(filterChatRows(demoRows, "  ").length, 4);
  });

  it("matches the name, the last message or the job line, ignoring case", () => {
    assert.deepEqual(filterChatRows(demoRows, "carlos").map((row) => row.id), ["c_carlos"]);
    assert.deepEqual(filterChatRows(demoRows, "THURSDAY").map((row) => row.id), ["c_carlos"]);
    assert.deepEqual(filterChatRows(demoRows, "water heater").map((row) => row.id), ["c_lucia"]);
  });
});
