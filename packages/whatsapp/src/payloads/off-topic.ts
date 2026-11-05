// Payload 14: the fixed reply for off-topic questions.
import { textMessage, type OutgoingMessage } from "../client.ts";

const BODY = "I can only help you find and contact local businesses. What do you need today?";

export function offTopic(input: { to: string }): OutgoingMessage {
  return textMessage(input.to, BODY);
}
