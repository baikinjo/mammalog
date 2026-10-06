/**
 * Date-only arithmetic on `YYYY-MM-DD` date ids. Dates are counted as whole calendar days, never as 24-hour spans, so a
 * time zone or daylight-saving change cannot move a result by a day.
 */

const DAY_MS = 86_400_000;

type CalendarParts = { year: number; month: number; day: number };

/** The parts of a real calendar date written as `YYYY-MM-DD`; anything else (including 2026-02-30) is null. */
function partsOf(dateId: string): CalendarParts | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateId);
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
    ? { year, month, day }
    : null;
}

function format({ year, month, day }: CalendarParts): string {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function dayNumber({ year, month, day }: CalendarParts): number {
  return Date.UTC(year, month - 1, day) / DAY_MS;
}

/** The local calendar date of `date`. */
export function localDateId(date: Date): string {
  return format({ year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate() });
}

/** `dateId` moved by whole calendar months; a day the target month lacks becomes its last day (08-31 + 6 → 02-28/29). */
export function addCalendarMonths(dateId: string, months: number): string | null {
  const parts = partsOf(dateId);
  if (!parts) return null;
  const monthIndex = parts.year * 12 + parts.month - 1 + months;
  const year = Math.floor(monthIndex / 12);
  const month = monthIndex - year * 12 + 1;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return format({ year, month, day: Math.min(parts.day, lastDay) });
}

/** Calendar days from `from` to `to` (negative when `to` is earlier), or null unless both are real calendar dates. */
export function calendarDaysBetween(from: string, to: string): number | null {
  const start = partsOf(from);
  const end = partsOf(to);
  return start && end ? dayNumber(end) - dayNumber(start) : null;
}

/**
 * Whole calendar months from `birthDate` to `onDate`. A month is complete on the same day of a later month, or on that
 * month's last day when it is shorter, so a child born on 08-31 turns six months on 02-28 (02-29 in a leap year).
 */
export function completedCalendarMonths(birthDate: string, onDate: string): number | null {
  const birth = partsOf(birthDate);
  const on = partsOf(onDate);
  if (!birth || !on) return null;
  const months = (on.year - birth.year) * 12 + on.month - birth.month;
  const completed = addCalendarMonths(birthDate, months)! > onDate ? months - 1 : months;
  return Math.max(0, completed);
}
