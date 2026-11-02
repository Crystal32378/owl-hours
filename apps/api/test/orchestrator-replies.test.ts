// S6 (RED): the taps on payloads 12 and 13. inbound.ts already records every
// tap as the customer's message in the open business chat; the owner reads
// "Sounds good" or "I have a question" there. For the two question buttons
// Zukki also tells the customer to type the question and that it goes to the
// business. Nothing else is queued to the customer.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { respond } from "../src/orchestrator/respond.ts";
import type {
  ConversationFacts,
  RespondDeps,
  Turn,
  TurnContext,
  ZukkiMessage,
} from "../src/orchestrator/types.ts";

const CHAT = "40000000-0000-4000-8000-000000000001";
const NORTHSIDE = "10000000-0000-4000-8000-000000000001";
const QUOTE = "90000000-0000-4000-8000-000000000001";
const NOW = new Date("2026-11-03T05:05:00.000Z");

const baseFacts: ConversationFacts = {
  state: "chatting",
  category: "plumbing",
  urgency: "now",
  safety: "answered",
  locationAsked: true,
  hasLocation: true,
  hasTitle: true,
};

type Queued = { message: ZukkiMessage; tenantId: string | null };

function setup(options: { facts?: Partial<ConversationFacts> } = {}) {
  const queued: Queued[] = [];
  const deps: RespondDeps = {
    store: {
      facts: async () => ({ ...baseFacts, ...options.facts }),
      queue: async (_id, message, tenantId) => {
        assert.ok(message.kind === "text" || message.payload, `${message.kind} message needs a payload`);
        queued.push({ message, tenantId: tenantId ?? null });
      },
      saveNeed: async () => {},
      history: async () => [],
      saveTranscript: async () => {},
      businessName: async (id) => (id === NORTHSIDE ? "Northside Plumbing" : "Eastside Plumbing"),
    },
    directory: {
      matches: async () => [],
      connect: async () => ({ expiresAt: new Date(NOW.getTime() + 5 * 60_000).toISOString() }),
    },
    understand: async () => ({ onTopic: true, category: "plumbing", urgent: true, title: null, summary: null }),
    readMedia: async () => ({ parts: [], transcript: null, markedFrameUrl: null, valveAdvice: null, shutOffWontHelp: false }),
    answer: async () => "Happy to help.",
    typing: async () => {},
    now: () => NOW,
    log: { info: () => {}, warn: () => {}, error: () => {} },
  };
  return { deps, queued };
}

// The chat with the business is open: 12 and 13 arrived there, so the tap
// does too.
const ctx = (over: Partial<TurnContext> = {}): TurnContext => ({
  conversationId: CHAT,
  waMessageId: "wamid.IN",
  isNewConversation: false,
  businessId: NORTHSIDE,
  ...over,
});

const button = (id: string, title = id): Turn => ({ kind: "button", id, title });

describe("respond: reply and quote taps reach the business chat (S6)", () => {
  it("sends the customer nothing on reply_ok: the tap already reached the owner (12)", async () => {
    const { deps, queued } = setup();
    await respond(deps, ctx(), button("reply_ok", "Sounds good"));
    assert.deepEqual(queued, []);
  });

  it("asks the customer to type the question for the business on reply_question (12)", async () => {
    const { deps, queued } = setup();
    await respond(deps, ctx(), button("reply_question", "Ask a question"));
    assert.deepEqual(queued, [
      {
        message: { kind: "text", body: "Type your question and I'll pass it to Northside Plumbing." },
        tenantId: NORTHSIDE,
      },
    ]);
  });

  it("asks the customer to type the question for the business on quote_question (13)", async () => {
    const { deps, queued } = setup();
    await respond(deps, ctx(), button(`quote_question:${QUOTE}`, "Ask a question"));
    assert.deepEqual(queued, [
      {
        message: { kind: "text", body: "Type your question and I'll pass it to Northside Plumbing." },
        tenantId: NORTHSIDE,
      },
    ]);
  });

  it("still ignores an unrelated button without queuing anything", async () => {
    const { deps, queued } = setup();
    await respond(deps, ctx({ businessId: null }), button("bogus_button", "Bogus"));
    assert.deepEqual(queued, []);
  });
});
