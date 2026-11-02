import { weekdayNames } from "../copys/hoursCopys.ts";

// One opening shift as GET /business returns it: weekday 0 = Sunday, "HH:MM" times.
export type OpeningHours = { weekday: number; opens: string; closes: string };

// Week order of the summary: Monday first, Sunday last, as the design reads.
export const WEEK = [1, 2, 3, 4, 5, 6, 0];

// The Hours row of a live business ("Mon–Sat, 8 AM–8 PM"): consecutive days
// with the same hours share one range; a closed day breaks the run.
export function hoursSummary(hours: OpeningHours[]): string {
  return groupConsecutiveDays(hours).map(groupText).join(" · ");
}

type DayGroup = { firstDay: number; lastDay: number; hoursText: string };

function groupConsecutiveDays(hours: OpeningHours[]): DayGroup[] {
  const groups: DayGroup[] = [];
  let previous: DayGroup | null = null;
  for (const weekday of WEEK) {
    const text = dayHoursText(hours, weekday);
    if (text === "") {
      previous = null;
    } else if (previous && previous.hoursText === text) {
      previous.lastDay = weekday;
    } else {
      previous = { firstDay: weekday, lastDay: weekday, hoursText: text };
      groups.push(previous);
    }
  }
  return groups;
}

function dayHoursText(hours: OpeningHours[], weekday: number): string {
  return hours
    .filter((shift) => shift.weekday === weekday)
    .map((shift) => `${clockText(shift.opens)}–${clockText(shift.closes)}`)
    .join(", ");
}

function groupText(group: DayGroup): string {
  const first = weekdayNames[group.firstDay];
  const dayRange = group.firstDay === group.lastDay ? first : `${first}–${weekdayNames[group.lastDay]}`;
  return `${dayRange}, ${group.hoursText}`;
}

// "08:00" reads "8 AM", "08:30" reads "8:30 AM".
function clockText(time: string): string {
  const [hours24, minutes] = time.split(":").map(Number);
  const period = hours24 < 12 ? "AM" : "PM";
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
  return minutes === 0 ? `${hours12} ${period}` : `${hours12}:${String(minutes).padStart(2, "0")} ${period}`;
}
