// Payload 15: the customer typed Zukki during a business chat.
import { textMessage, type OutgoingMessage } from "../client.ts";

export function zukkiIsBack(input: { to: string; businessName: string }): OutgoingMessage {
  return textMessage(input.to, `I'm here. Your chat with ${input.businessName} stays open. What do you need?`);
}
