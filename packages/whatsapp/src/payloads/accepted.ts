// Payload 10: the business accepted; the chat stays open.
import { textMessage, type OutgoingMessage } from "../client.ts";

export function accepted(input: { to: string; businessName: string }): OutgoingMessage {
  return textMessage(
    input.to,
    `${input.businessName} accepted. You're now talking with their team. Type *Zukki* anytime to talk to me.`,
  );
}
