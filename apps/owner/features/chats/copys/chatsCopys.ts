// Visible text of the chat screen. Sources: handoff-ui/owner-app/design/html/OwChat.dc.html,
// OwChatPolish.dc.html and HANDOFF-RN-UI.md section 8; the quote bubble mirrors the WhatsApp message
// handoff-ui/whatsapp/payloads/13-quote.json.
import { QUOTE_MESSAGE_WORDS } from "../../../shared/lib/quoteMessage.ts";

const copys = {
  // top bar and thread
  backLabel: "Back",
  viaZukkiWhatsApp: "via Zukki · WhatsApp",
  youAcceptedAt: "You accepted at",
  zukkiName: "Zukki",
  viewJobAndEvidence: "View job and evidence",
  // suggestion row above the composer
  zukkiSuggestsQuote: "Zukki suggests sending the quote:",
  reviewQuote: "Review",
  // the quote entry when Zukki suggests nothing: the quote modal's title (jobsCopys.sendAQuote)
  sendAQuote: "Send a quote",
  // composer
  messageLabel: "Message",
  writeToPlaceholder: "Write to",
  sendLabel: "Send",
  polishSwitchLabel: "Polish with Zukki",
  // metadata under the owner bubble
  sentAsWritten: "sent as written",
  sentPolished: "Written with Zukki, approved by Northside",
  // PolishCompare
  youWrote: "You wrote",
  zukkiVersion: "Zukki's version · English, Ana's language",
  sendMine: "Send mine",
  sendZukkis: "Send Zukki's",
  // polish states
  polishing: "Polishing…",
  polishFailed: "Couldn't polish. Send yours or try again.",
  // quote bubble: header, footer and the customer's reply buttons; the body wording is shared with jobs
  quoteFrom: "Quote from",
  ...QUOTE_MESSAGE_WORDS,
  quoteFooter: "Nothing is booked until you approve",
  approveVisit: "Approve visit",
  askQuestion: "Ask a question",
  // error state, HANDOFF-RN-UI.md section 8 "Every screen also needs"
  somethingWentWrong: "Something went wrong.",
  tryAgain: "Try again",
} as const;

// The string index signature lets tests and tooling walk the copys by key name.
export const chatsCopys: Readonly<Record<string, string>> & typeof copys = copys;
