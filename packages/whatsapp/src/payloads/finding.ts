// Payload 06: acknowledgement while the directory lookup runs.
import { textMessage, type OutgoingMessage } from "../client.ts";
import { someone, type Category } from "./nouns.ts";

export function finding(input: { to: string; category: Category }): OutgoingMessage {
  return textMessage(input.to, `Thanks. I'm finding ${someone(input.category)}.`);
}
