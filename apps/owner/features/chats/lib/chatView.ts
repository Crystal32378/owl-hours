// Serializable shapes shared by the chat hook and the chat screen.
import type { Message, PolishPreview } from "../../../shared/data/types.ts";
import type { QuoteCard } from "./quoteCard.ts";

// composing → polishing → comparing → sent; "sent" behaves like "composing" for the composer.
export type ComposerStep = "composing" | "polishing" | "comparing" | "sent";

// What the composer needs to know after Send: keep the draft only when nothing was sent or compared.
export type SendOutcome = "sent" | "comparing" | "polish_failed" | "send_failed" | "not_sent";

export type ThreadMessage = Message & { deliveryLabel: string | null; quoteCard: QuoteCard | null };

// Serializable by design: it crosses into the DOM component as props.
export type ChatView = {
  customerName: string;
  customerFirstName: string;
  acceptedAt: string | null; // when the business accepted; the demo uses its first thread message; null while unknown
  thread: ThreadMessage[];
  step: ComposerStep;
  preview: PolishPreview | null; // set only while step is "comparing"
  jobId: string | null; // the job "View job and evidence" opens; null when the conversation has none
  suggestedQuoteText: string | null; // "$130–160" for the SuggestionRow; null when Zukki suggests nothing or the quote was sent
  canSendQuote: boolean; // the chat has a job and no quote was sent yet: the quote entry shows, with or without a suggestion
  polishEnabled: boolean;
  polishFailed: boolean;
  sendFailed: boolean;
};

// A load can end in three different ways; the screen must tell them apart.
export type ConversationSnapshot = { status: "loading" | "not_found" | "failed" } | { status: "ready"; chat: ChatView };
