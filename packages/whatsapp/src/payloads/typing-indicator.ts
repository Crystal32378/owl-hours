// Payload 03: the status body markRead posts as is, envelope included.
// Kept free of client.ts so client.ts can import it without a cycle.
export function typingIndicator(input: { messageId: string; typing?: boolean | undefined }): Record<string, unknown> {
  if (input.typing === false) {
    return { messaging_product: "whatsapp", status: "read", message_id: input.messageId };
  }
  return {
    messaging_product: "whatsapp",
    status: "read",
    message_id: input.messageId,
    typing_indicator: { type: "text" },
  };
}
