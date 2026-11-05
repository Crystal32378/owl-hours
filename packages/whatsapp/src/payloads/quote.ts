// Payload 13: the owner's quote. The technician pays nothing here; the
// customer pays the technician after the repair.
import { buttonMessage, type OutgoingMessage, type ReplyButton } from "../client.ts";
import { BUTTON_BODY_MAX, HEADER_MAX, clip } from "./limits.ts";
import { moneyRange } from "./money.ts";

export type QuoteLine = { label: string; min: number; max: number };

export type QuoteInput = {
  to: string;
  quoteId: string;
  businessName: string;
  technician: string | null;
  arrivalWindow: string | null;
  lines: QuoteLine[];
  totalMin: number;
  totalMax: number;
  currency: string;
};

export function quote(input: QuoteInput): OutgoingMessage {
  return buttonMessage(input.to, {
    body: clip(quoteBody(input), BUTTON_BODY_MAX),
    buttons: quoteButtons(input.quoteId),
    footer: "Nothing is booked until you approve",
    headerText: clip(`Quote from ${input.businessName}`, HEADER_MAX),
  });
}

function quoteButtons(quoteId: string): ReplyButton[] {
  return [
    { id: `quote_approve:${quoteId}`, title: "Approve visit" },
    { id: `quote_question:${quoteId}`, title: "Ask a question" },
  ];
}

function quoteBody(input: QuoteInput): string {
  const who = input.technician ?? input.businessName;
  const lead = input.arrivalWindow ? `${who} · arrives ${input.arrivalWindow}` : who;
  const lines = [
    ...input.lines.map((line) => `${line.label}: ${moneyRange(line.min, line.max, input.currency)}`),
    `*Estimated total: ${moneyRange(input.totalMin, input.totalMax, input.currency)}*`,
  ].join("\n");
  const payTo = input.technician ? (input.technician.split(/\s+/)[0] ?? input.businessName) : input.businessName;
  return [lead, lines, `You pay ${payTo} after the repair.`].join("\n\n");
}
