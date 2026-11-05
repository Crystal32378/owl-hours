// The orchestrator with real parts: Supabase, Muse Spark, the media
// pipeline (Voice Transcribe, ffmpeg, SAM 3.1) and the WhatsApp client for
// the typing indicator.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ChatChoice, ChatRequest } from "@owl-hours/meta-models";
import type { WhatsAppClient } from "@owl-hours/whatsapp";
import { CUSTOMER_SYSTEM_PROMPT } from "../agent/customer-agent.ts";
import * as whatsapp from "../services/whatsapp-service.ts";
import type { Logger } from "../whatsapp/inbound.ts";
import type { PipelineDeps } from "../worker/process-message.ts";
import { historyMessages } from "./history.ts";
import { createMediaReader } from "./media.ts";
import { createConversationStore } from "./store.ts";
import type { Directory, RespondDeps } from "./types.ts";
import { understandNeed } from "./understand.ts";

export function createDirectory(db: SupabaseClient): Directory {
  return {
    matches: (conversationId, category) => whatsapp.findMatches(db, { conversationId, category }),
    connect: async (conversationId, businessId) => {
      const suggested = await suggestedQuoteOrNone(db, businessId);
      const offer = await whatsapp.connectBusiness(db, {
        conversationId,
        businessId,
        suggestedMin: suggested?.min,
        suggestedMax: suggested?.max,
      });
      return { expiresAt: offer.expiresAt };
    },
  };
}

export function createRespondDeps(input: {
  db: SupabaseClient;
  chat: (request: ChatRequest) => Promise<ChatChoice>;
  pipeline: PipelineDeps;
  whatsapp?: Pick<WhatsAppClient, "markRead"> | undefined;
  log: Logger;
}): RespondDeps {
  const { pipeline, whatsapp: client } = input;
  return {
    store: createConversationStore(input.db),
    directory: createDirectory(input.db),
    understand: (request) => understandNeed(input.chat, request),
    readMedia: createMediaReader(pipeline, input.log),
    answer: async ({ conversationId, history, parts, note }) => {
      const run = await pipeline.runAgent(
        [
          { role: "system", content: `${CUSTOMER_SYSTEM_PROMPT}\n${note}` },
          ...historyMessages(history),
          { role: "user", content: parts },
        ],
        conversationId,
      );
      return run.reply;
    },
    typing: client ? (waMessageId) => client.markRead(waMessageId, { typing: true }) : undefined,
    now: () => new Date(),
    log: input.log,
  };
}

// The suggested range is optional: a failure to compute it must never stop the customer's connect.
async function suggestedQuoteOrNone(db: SupabaseClient, businessId: string) {
  try {
    return await whatsapp.suggestedQuoteFor(db, businessId, new Date());
  } catch (error) {
    console.warn(`[api] suggested quote for ${businessId} failed, the offer stands:`, error);
    return null;
  }
}
