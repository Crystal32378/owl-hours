// Shapes shared by the conversation orchestrator: what came in (Turn), what
// Zukki queues (ZukkiMessage) and the dependencies respond() needs, each
// injected so the decisions can be tested without Supabase or the models.
import type { ContentPart } from "@owl-hours/meta-models";
import type { Category } from "@owl-hours/shared";
import type { Logger } from "../whatsapp/inbound.ts";

export type Urgency = "now" | "today" | "week";

// One stored customer message, as the orchestrator sees it.
export type Turn =
  | { kind: "text"; text: string }
  | { kind: "media"; mediaId: string; mediaType: "image" | "video" | "audio"; caption: string | null }
  // The file could not be downloaded from WhatsApp.
  | { kind: "media_failed" }
  // Reply buttons and list rows: the id is ours (payloads 02, 04, 07, 12, 13).
  | { kind: "button"; id: string; title: string }
  | { kind: "location" };

export type TurnContext = {
  conversationId: string;
  waMessageId: string;
  isNewConversation: boolean;
  // Set while a business chat is open: Zukki stays quiet (product rule 6).
  businessId: string | null;
};

export type ReplyButton = { id: string; title: string };

// A message Zukki queues in the outbox. The outbox renders it from kind and
// payload (whatsapp/outbox.ts).
export type ZukkiMessage = {
  kind: "text" | "interactive" | "location_request";
  body: string;
  payload?: Record<string, unknown> | undefined;
};

// "awaiting": the safety buttons were sent and the customer has not tapped one.
export type SafetyStep = "none" | "awaiting" | "answered";

export type ConversationFacts = {
  state: string;
  category: Category | null;
  urgency: Urgency | null;
  safety: SafetyStep;
  locationAsked: boolean;
  hasLocation: boolean;
  hasTitle: boolean;
};

export type HistoryEntry = { from: "customer" | "zukki" | "owner"; text: string };

export type ConversationStore = {
  facts(conversationId: string): Promise<ConversationFacts>;
  // tenantId: the business whose chat the message belongs to, or null while with Zukki.
  queue(conversationId: string, message: ZukkiMessage, tenantId?: string | null): Promise<void>;
  saveNeed(
    conversationId: string,
    need: { category: Category; urgency: Urgency; title: string | null; summary: string | null },
  ): Promise<void>;
  // Oldest first, without the message identified by skipWaMessageId (the one being answered).
  history(conversationId: string, limit: number, skipWaMessageId?: string): Promise<HistoryEntry[]>;
  saveTranscript(mediaId: string, transcript: string): Promise<void>;
  businessName(tenantId: string): Promise<string | null>;
};

// What payload 07 shows (services/whatsapp-service.ts findMatches).
export type Match = {
  businessId: string;
  name: string;
  shortName: string;
  rating: number | null;
  reviews: number | null;
  distanceKm: number | null;
  etaMinutes: number | null;
  openNow: boolean;
  takesNightJobs: boolean;
  currency: string;
  visit: number | null;
  nightFee: { amount: number; window: string | null } | null;
  repairFrom: number | null;
  repairLabel: string | null;
};

export type Directory = {
  // Best first; businesses already offered or suggested in this chat are skipped.
  matches(conversationId: string, category: Category): Promise<Match[]>;
  connect(conversationId: string, businessId: string): Promise<{ expiresAt: string }>;
};

export type Understanding = {
  onTopic: boolean;
  category: Category | null;
  urgent: boolean;
  title: string | null;
  summary: string | null;
};

export type MediaReading = {
  // What the models get: the image, caption or transcript.
  parts: ContentPart[];
  transcript: string | null;
  // Set when SAM marked the shut-off valve (payload 04's image).
  markedFrameUrl: string | null;
  // Set when the valve was looked for but not found with confidence.
  valveAdvice: string | null;
  // Spark saw closing a water valve will not stop this (rain, a roof, an old stain).
  shutOffWontHelp: boolean;
  // What Spark saw and what to do now, written for the customer.
  analysis: string | null;
  // Spark rated what it saw as an emergency or urgent.
  serious: boolean;
};

export type RespondDeps = {
  store: ConversationStore;
  directory: Directory;
  understand(input: { history: HistoryEntry[]; parts: ContentPart[]; knownCategory: Category | null }): Promise<Understanding>;
  readMedia(input: {
    conversationId: string;
    mediaId: string;
    mediaType: "image" | "video" | "audio";
    caption: string | null;
    findValve: boolean;
  }): Promise<MediaReading>;
  // Zukki's free-form answer (Spark with the directory tools).
  answer(input: { conversationId: string; history: HistoryEntry[]; parts: ContentPart[]; note: string }): Promise<string>;
  typing?: ((waMessageId: string) => Promise<void>) | undefined;
  now: () => Date;
  log: Logger;
};
