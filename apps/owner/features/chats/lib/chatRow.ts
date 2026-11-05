// One row of the Chats list and the search over the rows. Pure: no React, no I/O.
import type { Conversation, ISODate } from "../../../shared/data/types.ts";
import { wallClockTimeText } from "../../../shared/lib/wallClockTime.ts";
import { MONTH_NAMES, WEEKDAY_NAMES, chatsListCopys } from "../copys/chatsListCopys.ts";

// Serializable by design: it crosses into the DOM component as props.
// The avatar draws its own initials from the name (Astryx Avatar).
export type ChatRowView = {
  id: string;
  name: string;
  timestamp: string; // "12:07 AM", "Yesterday", "Mon", "Oct 20"
  preview: string; // the last message, "You: …" when the owner wrote it
  unread: number; // the row is bold with a count badge above 0
  jobLine: string; // "Leaking toilet · visit 12:55 AM"
};

const DAY_MS = 24 * 60 * 60 * 1000;
const ISO_CALENDAR_DATE = /^(\d{4})-(\d{2})-(\d{2})/;

export function chatRowOf(conversation: Conversation, now: ISODate): ChatRowView {
  return {
    id: conversation.id,
    name: conversation.customerName,
    timestamp: chatTimestamp(conversation.lastMessage.sentAt, now),
    preview: previewOf(conversation),
    unread: conversation.unread,
    jobLine: [conversation.jobTitle, conversation.statusLine].filter(Boolean).join(" · "),
  };
}

// Clock time within the last 24 hours, then "Yesterday", the weekday within a week, else "Oct 20".
// Days are counted on each timestamp's own calendar date, the wall-clock convention of wallClockTimeText.
export function chatTimestamp(sentAt: ISODate, now: ISODate): string {
  if (Date.parse(now) - Date.parse(sentAt) < DAY_MS) return wallClockTimeText(sentAt) ?? "";

  const sentDay = calendarDayOf(sentAt);
  const daysAgo = Math.round((calendarDayOf(now).getTime() - sentDay.getTime()) / DAY_MS);
  if (daysAgo <= 1) return chatsListCopys.yesterday;
  if (daysAgo < 7) return WEEKDAY_NAMES[sentDay.getUTCDay()];
  return `${MONTH_NAMES[sentDay.getUTCMonth()]} ${sentDay.getUTCDate()}`;
}

export function filterChatRows(rows: readonly ChatRowView[], query: string): ChatRowView[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [...rows];

  return rows.filter((row) => [row.name, row.preview, row.jobLine].some((text) => text.toLowerCase().includes(needle)));
}

function previewOf({ lastMessage }: Conversation): string {
  return lastMessage.from === "owner" ? `${chatsListCopys.youPrefix} ${lastMessage.text}` : lastMessage.text;
}

// The date part of the timestamp as written, at midnight UTC, so day arithmetic ignores the offset.
function calendarDayOf(isoTimestamp: ISODate): Date {
  const [, year, month, day] = ISO_CALENDAR_DATE.exec(isoTimestamp) ?? [];
  return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
}
