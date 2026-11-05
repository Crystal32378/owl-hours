import type { ISODate } from "../../../shared/data/types.ts";
import { getOwnerLiveApi } from "../../../shared/infra/ownerApiRuntime.ts";
import type { ConversationsService } from "../services/conversationsService.ts";
import { chatsNowFor } from "../lib/chatsNow.ts";
import { conversationsServiceFor } from "./conversationsServiceFor.ts";

// Composition root of the chat hooks: one service for the app's lifetime, so the Chats list and an open
// chat share the same client (and its pending polish drafts).
export function defaultConversationsService(): ConversationsService {
  return defaultRoot().service;
}

export function defaultChatsNow(): ISODate {
  return chatsNowFor(defaultRoot().isLive, new Date());
}

type Root = { service: ConversationsService; isLive: boolean };

function defaultRoot(): Root {
  if (!root) {
    const liveApi = getOwnerLiveApi();
    root = { service: conversationsServiceFor(liveApi), isLive: liveApi !== null };
  }
  return root;
}

let root: Root | null = null;
