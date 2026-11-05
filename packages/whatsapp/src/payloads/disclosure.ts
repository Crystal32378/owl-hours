// Payload 01: the AI disclosure, sent by our code before anything else.
import { textMessage, type OutgoingMessage } from "../client.ts";

const BODY =
  "Hi, I'm Zukki, an AI assistant that finds you a local business and connects you with it. A person from the business confirms every request.";

export function disclosure(input: { to: string }): OutgoingMessage {
  return textMessage(input.to, BODY);
}
