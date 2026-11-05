// The device zone is fixed so the mapped local times are exact (Bogotá: UTC-5, no daylight saving).
process.env.TZ = "America/Bogota";

// Spec: odd/tasks/owner-chat-live-fixes.md, S1-S3. A chat loaded from the live owner API draws the
// quote the owner sent with the quote bubble (S1), offers the quote entry for a job without Zukki's
// suggestion (S2), and shows the time the business accepted the offer (S3).
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createOwnerApi } from "../../../shared/infra/ownerApi.ts";
import type { ChatView } from "../lib/chatView.ts";
import { createConversationsService } from "../services/conversationsService.ts";
import { createLiveConversationsClient } from "../services/liveConversationsClient.ts";
import { createConversationSession } from "./conversationSession.ts";

const chatRow = {
  id: "c1",
  offerId: "h1",
  businessId: "t1",
  title: "Kitchen sink",
  customerName: "Carlos M.",
  chatOpen: true,
  acceptedAt: "2026-10-28T05:05:28+00:00",
  lastMessageAt: "2026-10-28T05:07:00+00:00",
  job: { id: "j1", state: "proposed", arrivalWindow: null },
  lastMessage: null,
  unread: 0,
};

const customerMessage = {
  id: "m1", from: "customer", kind: "text", text: "My sink drips", payload: null,
  sentAt: "2026-10-28T05:04:00+00:00", status: "received", delivery: null, media: null, quote: null,
};

const quoteMessage = {
  id: "m2", from: "owner", kind: "interactive", text: "Estimated total: $130–160", payload: { variant: "quote" },
  sentAt: "2026-10-28T05:10:00+00:00", status: "sent", delivery: null, media: null,
  quote: {
    id: "q1",
    lines: [{ label: "Visit", min: 45, max: 45 }, { label: "Valve repair", min: 85, max: 115 }],
    total: { min: 130, max: 160 },
    arrivalFrom: "2026-10-28T05:55:00+00:00",
    arrivalTo: "2026-10-28T06:25:00+00:00",
    note: null,
    technician: "Mario R.",
  },
};

type Answers = { messages: unknown[]; suggestedQuote: { min: number; max: number } | null; jobState?: string };

async function loadedLiveChat({ messages, suggestedQuote, jobState = "proposed" }: Answers): Promise<ChatView> {
  const routes: Record<string, unknown> = {
    "/conversations": [{ ...chatRow, job: { ...chatRow.job, state: jobState } }],
    "/conversations/c1/messages": messages,
    "/offers?status=accepted": [{ id: "h1", suggestedQuote }],
    "/me": { businesses: [{ name: "Northside Plumbing" }] },
  };
  const fetch = (async (url: string) => {
    const path = url.replace("https://api.example.com/v1/owner", "");
    return Response.json({ success: true, data: routes[path] });
  }) as unknown as typeof globalThis.fetch;
  const api = createOwnerApi({ apiUrl: "https://api.example.com", getAccessToken: async () => "tok", fetch });
  const session = createConversationSession(createConversationsService(createLiveConversationsClient(api)), "c1");
  await session.load();

  const snapshot = session.getSnapshot();
  assert.equal(snapshot.status, "ready");
  return (snapshot as { status: "ready"; chat: ChatView }).chat;
}

describe("live chat: the sent quote (S1)", () => {
  it("draws the owner's quote message with the quote bubble", async () => {
    const chat = await loadedLiveChat({ messages: [customerMessage, quoteMessage], suggestedQuote: null });

    const sent = chat.thread[1];
    assert.equal(sent?.from, "owner");
    assert.equal(sent?.deliveryLabel, null);
    assert.deepEqual(sent?.quote, {
      lines: [{ label: "Visit", amount: 45 }, { label: "Valve repair", amount: { min: 85, max: 115 } }],
      total: { min: 130, max: 160 },
      arrival: { from: "12:55 AM", to: "1:25 AM" },
      technician: "Mario R.",
    });
    assert.deepEqual(sent?.quoteCard, {
      header: "Quote from Northside Plumbing",
      arrivalLine: "Mario R. · arrives 12:55–1:25 AM",
      lines: ["Visit: $45", "Valve repair: $85–115"],
      totalLine: "Estimated total: $130–160",
      payLine: "You pay Mario after the repair.",
      footer: "Nothing is booked until you approve",
      replyLabels: ["Approve visit", "Ask a question"],
    });
    assert.equal(chat.thread[0]?.quoteCard, null);
  });
});

describe("live chat: quoting without Zukki's suggestion (S2)", () => {
  it("offers the quote entry for the chat's job when the offer suggests no quote", async () => {
    const chat = await loadedLiveChat({ messages: [customerMessage], suggestedQuote: null });

    assert.equal(chat.jobId, "j1");
    assert.equal(chat.suggestedQuoteText, null);
    assert.equal(chat.canSendQuote, true);
  });

  it("still shows Zukki's suggestion when the offer has one", async () => {
    const chat = await loadedLiveChat({ messages: [customerMessage], suggestedQuote: { min: 130, max: 160 } });

    assert.equal(chat.jobId, "j1");
    assert.equal(chat.suggestedQuoteText, "$130–160");
    assert.equal(chat.canSendQuote, true);
  });

  it("offers no quote entry once the quote was sent", async () => {
    const chat = await loadedLiveChat({ messages: [customerMessage, quoteMessage], suggestedQuote: { min: 130, max: 160 } });

    assert.equal(chat.suggestedQuoteText, null);
    assert.equal(chat.canSendQuote, false);
  });

  it("offers no quote entry once the customer approved the job, as the API refuses that quote", async () => {
    const chat = await loadedLiveChat({ messages: [customerMessage], suggestedQuote: null, jobState: "customer_approved" });

    assert.equal(chat.canSendQuote, false);
  });
});

describe("live chat: the accept time (S3)", () => {
  it("is when the business accepted the offer, not the oldest message", async () => {
    const chat = await loadedLiveChat({ messages: [customerMessage], suggestedQuote: null });

    assert.equal(chat.acceptedAt, "2026-10-28T00:05:28-05:00");
  });
});
