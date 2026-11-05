// The chats on the live owner API (`/v1/owner`, docs/API.md): rows from owner_conversations and
// owner_conversation_messages become the app's Conversation and Message.
import type { OwnerApi } from "../../../shared/infra/ownerApi.ts";
import type { Conversation, ID, ISODate, Message, MoneyRange, PolishPreview, Quote, QuoteLine, Sender } from "../../../shared/data/types.ts";
import { chatsListCopys } from "../copys/chatsListCopys.ts";
import type { ConversationsClient, QuoteSuggestion } from "./conversationsService.ts";
import { localTimestamp } from "../../../shared/lib/localIsoString.ts";
import { wallClockTimeText } from "../../../shared/lib/wallClockTime.ts";

type ApiJobSummary = { id: ID; state: string; arrivalWindow: string | null };
type ApiQuote = {
  lines: { label: string; min: number; max: number }[];
  total: MoneyRange;
  arrivalFrom: ISODate;
  arrivalTo: ISODate;
  note: string | null;
  technician: string | null;
};
type ApiMessage = {
  id: ID;
  from: Sender;
  kind?: string;
  text: string | null;
  sentAt: ISODate;
  delivery?: Message["delivery"] | null;
  quote?: ApiQuote | null; // set on the owner message that holds a sent quote
};
type ApiConversation = {
  id: ID;
  offerId: ID;
  title: string | null;
  customerName: string | null;
  acceptedAt: ISODate | null;
  lastMessageAt: ISODate;
  job: ApiJobSummary | null;
  lastMessage: ApiMessage | null;
  unread: number;
};
type ApiDraft = { draftId: ID; original: string; polished: string | null; language: string | null };
type ApiOffer = { id: ID; suggestedQuote: MoneyRange | null };
type ApiMe = { businesses: { name: string }[] };

const WAITING_STATES = ["requested", "triaged", "proposed"];
// The states private.send_quote accepts: after the customer approves, a new quote is refused.
const QUOTABLE_STATES = ["proposed", "owner_confirmed"];
const VISIT_STATES = ["customer_approved", "en_route", "on_site"];

export function createLiveConversationsClient(api: OwnerApi): ConversationsClient {
  // The draft Zukki polished, per conversation, until the owner sends one of its two versions.
  const pendingDrafts = new Map<ID, ApiDraft>();

  async function fetchConversationRows(): Promise<ApiConversation[]> {
    return (await api.get("/conversations")) as ApiConversation[];
  }

  async function findConversationRow(id: ID): Promise<ApiConversation | null> {
    return (await fetchConversationRows()).find((row) => row.id === id) ?? null;
  }

  async function sendDraft(conversationId: ID, draft: ApiDraft, usePolished: boolean) {
    await api.post(`/drafts/${encodeURIComponent(draft.draftId)}/send`, { usePolished });
    pendingDrafts.delete(conversationId);
  }

  return {
    listConversations: async () => (await fetchConversationRows()).map(toConversation),

    findConversation: async (id) => {
      const row = await findConversationRow(id);
      return row ? toConversation(row) : null;
    },

    findQuoteSuggestion: async (conversationId) => {
      const row = await findConversationRow(conversationId);
      if (!row?.job) return null;

      const offers = (await api.get("/offers?status=accepted")) as ApiOffer[];
      return quoteSuggestionOf(row.job, offers.find((offer) => offer.id === row.offerId));
    },

    findBusinessName: async () => {
      const me = (await api.get("/me")) as ApiMe;
      const business = me.businesses[0];
      if (!business) throw new Error("The owner has no business");
      return business.name;
    },

    listMessages: async (conversationId) => {
      const rows = (await api.get(`${conversationPath(conversationId)}/messages`)) as ApiMessage[];
      return rows.filter(isShownInThread).map(toMessage);
    },

    saveMessage: async (conversationId, message) => {
      const draft = pendingDrafts.get(conversationId);
      const usePolished = draft ? draftVersionOf(draft, message) : null;
      if (draft && usePolished !== null) return sendDraft(conversationId, draft, usePolished);

      await api.post(`${conversationPath(conversationId)}/messages`, { text: message.text });
    },

    discardDraft: (conversationId) => {
      pendingDrafts.delete(conversationId);
    },

    polish: async (text, conversationId) => {
      const draft = (await api.post(`${conversationPath(conversationId)}/drafts`, { text })) as ApiDraft;
      pendingDrafts.set(conversationId, draft);
      return previewOf(draft);
    },
  };
}

function toConversation(row: ApiConversation): Conversation {
  return {
    id: row.id,
    offerId: row.offerId,
    customerName: row.customerName ?? "",
    jobTitle: row.title ?? "",
    statusLine: statusLineOf(row.job),
    // A chat always opens with Zukki's handoff message; the empty stand-in only keeps the row drawable.
    lastMessage: row.lastMessage ? toMessage(row.lastMessage) : { id: `${row.id}:none`, from: "zukki", text: "", sentAt: localTimestamp(row.lastMessageAt) },
    unread: row.unread,
    ...(row.job ? { jobId: row.job.id, jobTakesQuote: QUOTABLE_STATES.includes(row.job.state) } : {}),
    ...(row.acceptedAt ? { acceptedAt: localTimestamp(row.acceptedAt) } : {}),
  };
}

// The status after the job title: waiting for the owner's quote, quote sent, the visit (and its window), or done.
// A state the app does not know shows nothing rather than a wrong status.
function statusLineOf(job: ApiJobSummary | null): string {
  if (!job || WAITING_STATES.includes(job.state)) return chatsListCopys.waitingForYou;
  if (job.state === "done") return chatsListCopys.done;
  if (job.state === "owner_confirmed") return chatsListCopys.quoteSent;
  if (VISIT_STATES.includes(job.state)) return [chatsListCopys.visit, job.arrivalWindow].filter(Boolean).join(" ");
  return "";
}

// Only owner messages carry how they were sent (option A or B), or the quote they hold.
function toMessage(row: ApiMessage): Message {
  const message: Message = { id: row.id, from: row.from, text: row.text ?? "", sentAt: localTimestamp(row.sentAt) };
  if (row.from !== "owner") return message;
  if (row.quote) return { ...message, quote: toQuote(row.quote) };
  return row.delivery ? { ...message, delivery: row.delivery } : message;
}

// The arrival window is shown as the device's clock times, like the quote screen writes them.
function toQuote(quote: ApiQuote): Quote {
  return {
    lines: quote.lines.map(toQuoteLine),
    total: quote.total,
    arrival: { from: clockTimeOf(quote.arrivalFrom), to: clockTimeOf(quote.arrivalTo) },
    technician: quote.technician ?? "",
    ...(quote.note ? { note: quote.note } : {}),
  };
}

function toQuoteLine({ label, min, max }: ApiQuote["lines"][number]): QuoteLine {
  return { label, amount: min === max ? min : { min, max } };
}

function clockTimeOf(isoTimestamp: ISODate): string {
  return wallClockTimeText(localTimestamp(isoTimestamp)) ?? "";
}

function quoteSuggestionOf(job: ApiJobSummary, offer: ApiOffer | undefined): QuoteSuggestion | null {
  return offer?.suggestedQuote ? { jobId: job.id, suggestedQuote: { ...offer.suggestedQuote } } : null;
}

// Zukki's version is null when the model is unavailable: that is a failed polish, never an empty preview.
function previewOf(draft: ApiDraft): PolishPreview {
  if (draft.polished === null) throw new Error("Zukki could not polish this message");
  return { original: draft.original, polished: draft.polished, language: draft.language ?? "" };
}

// Which version of the pending draft this message is: Zukki's (true), the owner's (false), or neither (null).
function draftVersionOf(draft: ApiDraft, message: Message): boolean | null {
  if (message.delivery === "polished" && message.text === draft.polished) return true;
  if (message.text === draft.original) return false;
  return null;
}

function conversationPath(conversationId: ID): string {
  return `/conversations/${encodeURIComponent(conversationId)}`;
}

// A shared location has no text and the thread has no design for it.
function isShownInThread(row: ApiMessage): boolean {
  return !(row.kind === "location" && !row.text);
}
