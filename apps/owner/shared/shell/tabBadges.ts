// Tab-bar badge counts from the offers and conversations the app loaded (the API in live mode):
// requests still waiting for an answer, and unread messages across every chat.
export type TabBadges = { requests: number; chats: number };

export const NO_BADGES: TabBadges = { requests: 0, chats: 0 };

export function tabBadgeCounts(
  offers: { status: string }[],
  conversations: { unread: number }[],
): TabBadges {
  return {
    requests: offers.filter((offer) => offer.status === "offered").length,
    chats: conversations.reduce((sum, conversation) => sum + conversation.unread, 0),
  };
}
