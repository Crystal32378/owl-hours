// Visible text of the Chats list. Source: handoff-ui/owner-app/design/html/OwChats.dc.html and
// HANDOFF-RN-UI.md "Chats (OwChats)". The empty state is not in the design (section 8 asks for one).
const copys = {
  chatsTitle: "Chats",
  searchChats: "Search chats",
  // last-message line and timestamp
  youPrefix: "You:",
  yesterday: "Yesterday",
  // the "job · status" line
  waitingForYou: "waiting for you",
  quoteSent: "quote sent",
  done: "done",
  visit: "visit",
  footnote: "Customers write to Zukki on WhatsApp. Your replies reach them with your business name.",
  emptyChats: "No chats yet.",
} as const;

// The string index signature lets tests and tooling walk the copys by key name.
export const chatsListCopys: Readonly<Record<string, string>> & typeof copys = copys;

// Short weekday and month names of the list timestamps ("Mon", "Oct 20").
export const WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
export const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;
