// The "Ask a question" taps on payloads 12 (reply_question) and 13
// (quote_question:<quote id>).
export function isQuestionTap(id: string): boolean {
  return id === "reply_question" || id.startsWith("quote_question:");
}
