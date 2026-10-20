// Pure date helpers on "YYYY-MM-DD" strings (no timezone surprises). Portable to React Native.
import { addDays, differenceInCalendarDays, format, parseISO, startOfMonth, startOfWeek, endOfMonth, endOfWeek, eachDayOfInterval } from "date-fns";

export const toISODate = (d: Date) => format(d, "yyyy-MM-dd");
export const parseDate = (s: string) => parseISO(s);
export const shiftDate = (s: string, days: number) => toISODate(addDays(parseISO(s), days));
export const daysBetween = (from: string, to: string) => differenceInCalendarDays(parseISO(to), parseISO(from));

/** Monday-start week containing `s`. */
export function weekDays(s: string) {
  const start = startOfWeek(parseISO(s), { weekStartsOn: 1 });
  return Array.from({ length: 7 }, (_, i) => toISODate(addDays(start, i)));
}

/** Full calendar grid (Monday-start) for the month containing `s`. */
export function monthGrid(s: string) {
  const d = parseISO(s);
  return eachDayOfInterval({
    start: startOfWeek(startOfMonth(d), { weekStartsOn: 1 }),
    end: endOfWeek(endOfMonth(d), { weekStartsOn: 1 }),
  }).map(toISODate);
}

export const fmt = (s: string, pattern: string) => format(parseISO(s), pattern);

export function relativeDay(date: string, today: string) {
  const n = daysBetween(date, today);
  if (n === 0) return "Today";
  if (n === 1) return "Yesterday";
  if (n < 7) return fmt(date, "EEEE");
  return fmt(date, "MMM d");
}

export function agoLabel(lastWorn: string | null, today: string) {
  if (!lastWorn) return "Never worn";
  const n = daysBetween(lastWorn, today);
  if (n <= 0) return "Worn today";
  if (n === 1) return "Worn yesterday";
  return `${n} days ago`;
}
