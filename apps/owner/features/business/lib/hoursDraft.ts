import { WEEK, type OpeningHours } from "./hoursSummary.ts";

// One row of the hours editor. The row edits a day's first shift; any later shifts
// of that day stay as they are while it is open, so saving never loses them silently.
export type DayDraft = {
  weekday: number;
  isOpen: boolean;
  opens: string;
  closes: string;
  otherShifts: OpeningHours[];
};

const DEFAULT_OPENS = "08:00";
const DEFAULT_CLOSES = "20:00";

export function toDayDrafts(shifts: OpeningHours[]): DayDraft[] {
  return WEEK.map((weekday) => toDayDraft(weekday, shifts.filter((shift) => shift.weekday === weekday)));
}

export function toShifts(days: DayDraft[]): OpeningHours[] {
  return days
    .filter((day) => day.isOpen)
    .flatMap(({ weekday, opens, closes, otherShifts }) => [{ weekday, opens, closes }, ...otherShifts]);
}

// A shift may run past midnight (closes before it opens); it only has to last some time.
export function isDayValid(day: DayDraft): boolean {
  if (!day.isOpen) return true;
  return day.opens !== "" && day.closes !== "" && day.opens !== day.closes;
}

function toDayDraft(weekday: number, shifts: OpeningHours[]): DayDraft {
  const [first, ...otherShifts] = shifts;
  if (!first) return { weekday, isOpen: false, opens: DEFAULT_OPENS, closes: DEFAULT_CLOSES, otherShifts: [] };
  return { weekday, isOpen: true, opens: first.opens, closes: first.closes, otherShifts };
}
