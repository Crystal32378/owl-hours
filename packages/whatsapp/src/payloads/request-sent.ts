// Payload 08: the request is with the business; acceptMinutes is 5 when
// urgent, 30 otherwise.
import { textMessage, type OutgoingMessage } from "../client.ts";

export function requestSent(input: { to: string; businessName: string; acceptMinutes: number }): OutgoingMessage {
  return textMessage(
    input.to,
    `I sent your request to ${input.businessName}. They have up to ${input.acceptMinutes} minutes to accept.`,
  );
}
