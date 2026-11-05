import type { ISODate } from "../data/types.ts";

// The API stores instants (often in UTC); the app shows and segments wall-clock times. Writing an
// instant in the device's own offset lets wallClockTimeText and the calendar-day rules read it locally.
export function localIsoString(instant: Date): ISODate {
  const date = `${instant.getFullYear()}-${twoDigits(instant.getMonth() + 1)}-${twoDigits(instant.getDate())}`;
  const time = `${twoDigits(instant.getHours())}:${twoDigits(instant.getMinutes())}:${twoDigits(instant.getSeconds())}`;
  return `${date}T${time}${utcOffset(instant)}`;
}

// An API timestamp rewritten in the device's offset (same instant).
export function localTimestamp(isoTimestamp: string): ISODate {
  return localIsoString(new Date(isoTimestamp));
}

// getTimezoneOffset is minutes behind UTC, so UTC-5 answers 300.
function utcOffset(instant: Date): string {
  const minutesAhead = -instant.getTimezoneOffset();
  const sign = minutesAhead < 0 ? "-" : "+";
  const absolute = Math.abs(minutesAhead);
  return `${sign}${twoDigits(Math.floor(absolute / 60))}:${twoDigits(absolute % 60)}`;
}

function twoDigits(value: number): string {
  return String(value).padStart(2, "0");
}
