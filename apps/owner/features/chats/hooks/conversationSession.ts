// Framework-free session of one chat: loads it, drives the composer machine, talks to the service.
// useConversation is a thin React adapter over it.
import type { Conversation, ID, Message } from "../../../shared/data/types.ts";
import { firstName } from "../lib/customerName.ts";
import { moneyRangeText } from "../../../shared/lib/moneyText.ts";
import type { ChatView, ConversationSnapshot, SendOutcome } from "../lib/chatView.ts";
import { canStartChoice, canStartSend, composerReducer, initialComposerState } from "../lib/composerMachine.ts";
import type { ComposerEvent, ComposerState } from "../lib/composerMachine.ts";
import { deliveryLabel } from "../lib/ownerDelivery.ts";
import type { PolishChoice } from "../lib/ownerDelivery.ts";
import { hasSentQuote, quoteCardOf } from "../lib/quoteCard.ts";
import type { ConversationsService, QuoteSuggestion, SendResult } from "../services/conversationsService.ts";

export type ConversationSession = {
  getSnapshot: () => ConversationSnapshot; // same reference until something changes
  subscribe: (listener: () => void) => () => void;
  load: () => Promise<void>; // also the retry after a failed load
  reload: () => Promise<void>; // refetches a ready chat without leaving "ready"; a failed reload keeps what is shown
  send: (text: string) => Promise<SendOutcome>;
  sendChoice: (choice: PolishChoice) => Promise<void>;
  setPolishEnabled: (enabled: boolean) => void;
  dispose: () => void; // results that arrive afterwards are ignored
};

type LoadState =
  | { status: "loading" | "not_found" | "failed" }
  | {
      status: "ready";
      conversation: Conversation;
      messages: Message[];
      suggestion: QuoteSuggestion | null;
      businessName: string | null;
    };

export function createConversationSession(service: ConversationsService, id: ID): ConversationSession {
  let loadState: LoadState = { status: "loading" };
  let composer = initialComposerState;
  let snapshot = buildSnapshot(loadState, composer);
  let isDisposed = false;
  const listeners = new Set<() => void>();

  // Every state change ends here; a disposed session no longer changes or notifies.
  function publish() {
    if (isDisposed) return;

    snapshot = buildSnapshot(loadState, composer);
    listeners.forEach((listener) => listener());
  }

  function dispatch(event: ComposerEvent) {
    composer = composerReducer(composer, event);
    publish();
  }

  function appendToThread(message: Message) {
    if (loadState.status !== "ready") return;

    loadState = { ...loadState, messages: [...loadState.messages, message] };
  }

  function messageDelivered(message: Message) {
    appendToThread(message);
    dispatch({ type: "message_sent" });
  }

  async function load() {
    if (loadState.status !== "loading") {
      loadState = { status: "loading" };
      publish();
    }

    loadState = await fetchChat(service, id);
    publish();
  }

  async function reload() {
    if (loadState.status !== "ready") return;

    const reloaded = await fetchChat(service, id);
    if (reloaded.status !== "ready") return;

    loadState = reloaded;
    publish();
  }

  async function send(text: string): Promise<SendOutcome> {
    if (loadState.status !== "ready" || !canStartSend(composer)) return "not_sent";

    const polish = composer.polishEnabled;
    dispatch({ type: "send_started" });
    return polish ? preparePolish(text) : sendAsWritten(text);
  }

  async function sendAsWritten(text: string): Promise<SendOutcome> {
    try {
      const result = await service.sendMessage(id, text, { polish: false });
      if (!result || !isSent(result)) return nothingSent();

      messageDelivered(result.sent);
      return "sent";
    } catch {
      dispatch({ type: "send_failed" });
      return "send_failed";
    }
  }

  async function preparePolish(text: string): Promise<SendOutcome> {
    try {
      const result = await service.sendMessage(id, text, { polish: true });
      if (!result || isSent(result)) return nothingSent();

      dispatch({ type: "preview_received", preview: result });
      return "comparing";
    } catch {
      dispatch({ type: "polish_failed" });
      return "polish_failed";
    }
  }

  function nothingSent(): SendOutcome {
    dispatch({ type: "nothing_sent" });
    return "not_sent";
  }

  async function sendChoice(choice: PolishChoice) {
    const { preview } = composer;
    if (!preview || !canStartChoice(composer)) return;

    dispatch({ type: "choice_started" });
    try {
      const message = await service.sendPolishChoice(id, preview, choice);
      if (message) messageDelivered(message);
      else dispatch({ type: "nothing_sent" });
    } catch {
      dispatch({ type: "send_failed" });
    }
  }

  function setPolishEnabled(enabled: boolean) {
    dispatch({ type: "polish_switched", enabled });
  }

  return {
    getSnapshot: () => snapshot,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    load,
    reload,
    send,
    sendChoice,
    setPolishEnabled,
    dispose: () => {
      isDisposed = true;
      listeners.clear();
    },
  };
}

async function fetchChat(service: ConversationsService, id: ID): Promise<LoadState> {
  try {
    const [conversation, messages, suggestion, businessName] = await Promise.all([
      service.getConversation(id),
      service.getMessages(id),
      findSuggestionOrNone(service, id),
      findBusinessNameOrNone(service),
    ]);
    if (!conversation || !messages) return { status: "not_found" };

    return { status: "ready", conversation, messages, suggestion, businessName };
  } catch {
    return { status: "failed" };
  }
}

// The suggestion is a convenience: a failed lookup means "no suggestion", never a failed chat.
async function findSuggestionOrNone(service: ConversationsService, id: ID): Promise<QuoteSuggestion | null> {
  try {
    return await service.getQuoteSuggestion(id);
  } catch {
    return null;
  }
}

// The business name only writes the quote bubble's header: a failed lookup means the quote shows as plain text.
async function findBusinessNameOrNone(service: ConversationsService): Promise<string | null> {
  try {
    return await service.getBusinessName();
  } catch {
    return null;
  }
}

function buildSnapshot(loadState: LoadState, composer: ComposerState): ConversationSnapshot {
  if (loadState.status !== "ready") return { status: loadState.status };

  return { status: "ready", chat: buildChatView(loadState, composer) };
}

function buildChatView(
  { conversation, messages, suggestion, businessName }: Extract<LoadState, { status: "ready" }>,
  composer: ComposerState,
): ChatView {
  const { customerName } = conversation;
  const jobId = conversation.jobId ?? suggestion?.jobId ?? null;
  const isQuoteSent = hasSentQuote(messages);
  return {
    customerName,
    customerFirstName: firstName(customerName),
    // The demo's conversations carry no accept time: its chats open with the accept.
    acceptedAt: conversation.acceptedAt ?? messages[0]?.sentAt ?? null,
    thread: messages.map((message) => ({
      ...message,
      deliveryLabel: deliveryLabel(message),
      quoteCard: quoteCardOf(message, businessName),
    })),
    step: composer.step,
    jobId,
    suggestedQuoteText: suggestion && !isQuoteSent ? moneyRangeText(suggestion.suggestedQuote) : null,
    canSendQuote: jobId !== null && !isQuoteSent && conversation.jobTakesQuote !== false,
    preview: composer.preview,
    polishEnabled: composer.polishEnabled,
    polishFailed: composer.polishFailed,
    sendFailed: composer.sendFailed,
  };
}

function isSent(result: SendResult): result is { sent: Message } {
  return "sent" in result;
}
