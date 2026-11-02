import { firstName } from "../../../shared/lib/firstName.ts";
import { OWNER_TEXT, POLISHED_TEXT, anaJob, business, conversations as seedConversations, offers as seedOffers } from "../../../shared/data/mock.ts";
import { createThreadStore } from "../../../shared/data/threadStore.ts";
import type { ThreadStore } from "../../../shared/data/threadStore.ts";
import type { Conversation, ID, ISODate, Message, MoneyRange, PolishPreview } from "../../../shared/data/types.ts";
import { buildAsWrittenMessage, buildChosenMessage } from "../lib/ownerDelivery.ts";
import type { MessageStamp, PolishChoice } from "../lib/ownerDelivery.ts";

export type ConversationsClient = {
  listConversations(): Promise<Conversation[]>; // newest first
  findConversation(id: ID): Promise<Conversation | null>;
  findQuoteSuggestion(conversationId: ID): Promise<QuoteSuggestion | null>;
  findBusinessName(): Promise<string>;
  listMessages(conversationId: ID): Promise<Message[]>;
  saveMessage(conversationId: ID, message: Message): Promise<void>;
  polish(text: string, conversationId: ID): Promise<PolishPreview>; // the live API drafts per conversation
  // Forgets a polish draft the owner left unsent; only a client that keeps drafts needs it.
  discardDraft?(conversationId: ID): void;
};

// Zukki's suggestion for a conversation that has a job: which job, and the quote it proposes.
export type QuoteSuggestion = { jobId: ID; suggestedQuote: MoneyRange };

export type ConversationsDeps = {
  now: () => ISODate;
  newMessageId: () => ID;
};

// Option A answers {sent}; option B answers the preview the owner must still choose from.
export type SendResult = { sent: Message } | PolishPreview;

export type ConversationsService = {
  getConversations(): Promise<Conversation[]>; // the Chats list
  getConversation(id: ID): Promise<Conversation | null>;
  getQuoteSuggestion(conversationId: ID): Promise<QuoteSuggestion | null>;
  getBusinessName(): Promise<string>; // the name in the quote bubble's header
  getMessages(conversationId: ID): Promise<Message[] | null>;
  sendMessage(conversationId: ID, text: string, options: { polish: boolean }): Promise<SendResult | null>;
  sendPolishChoice(conversationId: ID, preview: PolishPreview, choice: PolishChoice): Promise<Message | null>;
};

export function createConversationsService(
  client: ConversationsClient,
  deps: Partial<ConversationsDeps> = {},
): ConversationsService {
  const { now, newMessageId } = { ...createDefaultDeps(), ...deps };

  const nextStamp = (): MessageStamp => ({ id: newMessageId(), sentAt: now() });

  async function hasConversation(id: ID) {
    return (await client.findConversation(id)) !== null;
  }

  async function append(conversationId: ID, message: Message) {
    await client.saveMessage(conversationId, message);
    return message;
  }

  return {
    getConversations: () => client.listConversations(),

    getConversation: (id) => client.findConversation(id),

    getQuoteSuggestion: (conversationId) => client.findQuoteSuggestion(conversationId),

    getBusinessName: () => client.findBusinessName(),

    getMessages: async (conversationId) =>
      (await hasConversation(conversationId)) ? client.listMessages(conversationId) : null,

    sendMessage: async (conversationId, text, { polish }) => {
      if (!(await hasConversation(conversationId))) return null;
      if (polish) return client.polish(text, conversationId);

      client.discardDraft?.(conversationId);
      return { sent: await append(conversationId, buildAsWrittenMessage(nextStamp(), text)) };
    },

    sendPolishChoice: async (conversationId, preview, choice) => {
      if (!(await hasConversation(conversationId))) return null;

      return append(conversationId, buildChosenMessage(nextStamp(), preview, choice));
    },
  };
}

// In-memory client seeded with private copies of the demo conversations. Messages live in a thread
// store: independent when omitted, or the shared one when the demo meets the jobs side.
export type FakeConversationsClientDeps = { threads: ThreadStore };

export function createFakeConversationsClient(deps: Partial<FakeConversationsClientDeps> = {}): ConversationsClient {
  const threads = deps.threads ?? createThreadStore();
  const conversationsById = new Map(structuredClone(seedConversations).map((conversation) => [conversation.id, conversation]));

  return {
    listConversations: async () => structuredClone([...conversationsById.values()]),
    findConversation: async (id) => structuredClone(conversationsById.get(id) ?? null),
    listMessages: async (conversationId) => threads.messages(conversationId),
    findQuoteSuggestion: async (conversationId) => findDemoQuoteSuggestion(conversationsById.get(conversationId)),
    findBusinessName: async () => business.name,
    saveMessage: async (conversationId, message) => threads.append(conversationId, message),
    polish: async (text, conversationId) => ({
      original: text,
      polished: text === OWNER_TEXT ? POLISHED_TEXT : politeDemoText(text, conversationsById.get(conversationId)?.customerName),
      language: "English",
    }),
  };
}

// The demo has no model behind it: a greeting and tidy punctuation show what polishing offers.
function politeDemoText(text: string, customerName: string | undefined): string {
  const trimmed = text.trim();
  const sentence = trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
  const ending = /[.!?]$/.test(sentence) ? "" : ".";
  const isGreeted = /^(hi|hello|hola)\b/i.test(trimmed);
  return customerName && !isGreeted ? `Hi ${firstName(customerName)}, ${sentence}${ending}` : `${sentence}${ending}`;
}

// Zukki suggests the quote of the offer behind a conversation, but only when that conversation has a job.
function findDemoQuoteSuggestion(conversation: Conversation | undefined): QuoteSuggestion | null {
  if (!conversation || anaJob.conversationId !== conversation.id) return null;

  const offer = seedOffers.find((candidate) => candidate.id === conversation.offerId);
  return offer ? { jobId: anaJob.id, suggestedQuote: { ...offer.suggestedQuote } } : null;
}

// Wall clock and a per-service counter; no crypto, so it also runs on Hermes.
function createDefaultDeps(): ConversationsDeps {
  let sentCount = 0;
  return {
    now: () => new Date().toISOString(),
    newMessageId: () => `m_sent_${++sentCount}`,
  };
}
