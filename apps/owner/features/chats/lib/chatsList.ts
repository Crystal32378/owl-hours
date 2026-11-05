import type { Conversation, ISODate } from "../../../shared/data/types.ts";
import { afterFailedLoad } from "../../../shared/lib/loadState.ts";
import type { LoadState } from "../../../shared/lib/loadState.ts";
import { chatRowOf } from "./chatRow.ts";
import type { ChatRowView } from "./chatRow.ts";

// What the Chats tab has loaded: nothing yet, a failed first load, or the conversations.
export type LoadedChats = LoadState<Conversation[]>;

// "loading" draws nothing; "failed" draws the error state and retries the load.
export type ChatsList =
  | { status: "loading" }
  | { status: "failed"; retry: () => Promise<void> }
  | { status: "ready"; rows: ChatRowView[] };

export function chatsListOf(loaded: LoadedChats, now: ISODate, reload: () => void): ChatsList {
  if (loaded === "loading") return { status: "loading" };
  if (loaded === "failed") return { status: "failed", retry: async () => reload() };
  return { status: "ready", rows: loaded.map((conversation) => chatRowOf(conversation, now)) };
}

// A failed reload keeps the rows already shown; only a failed first load fails the list.
export function loadedAfterFailure(shown: LoadedChats): LoadedChats {
  return afterFailedLoad(shown);
}
