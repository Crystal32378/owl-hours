import { useCallback, useEffect, useState } from "react";
import type { ISODate } from "../../../shared/data/types.ts";
import { chatsListOf, loadedAfterFailure } from "../lib/chatsList.ts";
import type { ChatsList, LoadedChats } from "../lib/chatsList.ts";
import type { ConversationsService } from "../services/conversationsService.ts";
import { defaultChatsNow, defaultConversationsService } from "./defaultConversationsService.ts";

export type ChatsDeps = { service: ConversationsService; now: () => ISODate };

export type { ChatsList } from "../lib/chatsList.ts";

// `reload` refetches the list without clearing the rows shown; call it when the tab regains focus.
export type ChatsListResult = { chats: ChatsList; reload: () => void };

// Pass a stable service (a module constant or memoized): changing it reloads the list.
export function useChats(deps?: Partial<ChatsDeps>): ChatsListResult {
  const [defaults] = useState(createDefaultDeps);
  const service = deps?.service ?? defaults.service;
  const now = deps?.now ?? defaults.now;
  const [loaded, setLoaded] = useState<LoadedChats>("loading");
  const [reloadToken, setReloadToken] = useState(0);
  const reload = useCallback(() => setReloadToken((token) => token + 1), []);

  useEffect(() => {
    let isCurrent = true;
    service
      .getConversations()
      .then((conversations) => {
        if (isCurrent) setLoaded(conversations);
      })
      .catch(() => {
        if (isCurrent) setLoaded(loadedAfterFailure);
      });
    return () => {
      isCurrent = false;
    };
  }, [service, reloadToken]);

  return { chats: chatsListOf(loaded, now(), reload), reload };
}

function createDefaultDeps(): ChatsDeps {
  return { service: defaultConversationsService(), now: defaultChatsNow };
}
