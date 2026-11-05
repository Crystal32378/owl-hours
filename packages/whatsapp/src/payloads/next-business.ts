// Payload 09: the offer expired or was declined. Followed by 07 for the
// next business, or by noNextBusiness when nobody else is open.
import { textMessage, type OutgoingMessage } from "../client.ts";
import { nounFor, type Category } from "./nouns.ts";

export type NextReason = "expired" | "declined";

export function nextBusiness(input: { to: string; businessName: string; reason: NextReason }): OutgoingMessage {
  return textMessage(
    input.to,
    `${input.businessName} ${why(input.reason)}, so I won't keep you waiting. This business is free now:`,
  );
}

export function noNextBusiness(input: {
  to: string;
  businessName: string;
  reason: NextReason;
  category: Category | null;
}): OutgoingMessage {
  const who = input.category ? `other ${nounFor(input.category)}` : "other business";
  return textMessage(
    input.to,
    `${input.businessName} ${why(input.reason)}, and no ${who} is open near you right now. Message me anytime and I'll look again.`,
  );
}

function why(reason: NextReason): string {
  return reason === "expired" ? "didn't answer in time" : "can't take this one";
}
