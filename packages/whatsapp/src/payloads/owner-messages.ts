// Payloads 11 and 12: the owner's message, signed with the author's first
// name. 12 goes as buttons; past the interactive body limit it falls back
// to text with the footer as the last line.
import { buttonMessage, textMessage, type OutgoingMessage, type ReplyButton } from "../client.ts";
import { FOOTER_MAX, INTERACTIVE_BODY_MAX, clip } from "./limits.ts";

export const POLISHED_BUTTONS: ReplyButton[] = [
  { id: "reply_ok", title: "Sounds good" },
  { id: "reply_question", title: "Ask a question" },
];

export function ownerMessageAsWritten(input: {
  to: string;
  businessName?: string | null | undefined;
  senderFirstName?: string | null | undefined;
  ownerText: string;
}): OutgoingMessage {
  return textMessage(input.to, signedBody(businessNameOf(input.businessName), input.senderFirstName ?? null, input.ownerText));
}

export function ownerMessagePolished(input: {
  to: string;
  businessName?: string | null | undefined;
  senderFirstName?: string | null | undefined;
  polishedText: string;
  businessShortName?: string | null | undefined;
}): OutgoingMessage {
  const business = businessNameOf(input.businessName);
  const signed = signedBody(business, input.senderFirstName ?? null, input.polishedText);
  const footer = clip(polishFooter(business, input.businessShortName ?? null), FOOTER_MAX);
  if (signed.length > INTERACTIVE_BODY_MAX) {
    return textMessage(input.to, `${signed}\n\n_${footer}_`);
  }
  return buttonMessage(input.to, { body: signed, buttons: POLISHED_BUTTONS, footer });
}

function businessNameOf(businessName: string | null | undefined): string {
  return businessName ?? "Your business";
}

function signedBody(business: string, senderFirstName: string | null, text: string): string {
  return `*${senderFirstName ? `${business} · ${senderFirstName}` : business}*\n${text}`;
}

function polishFooter(business: string, businessShortName: string | null): string {
  return `Written with Zukki, approved by ${businessShortName ?? business}`;
}
