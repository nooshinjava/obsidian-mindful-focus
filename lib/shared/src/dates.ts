/**
 * Date helpers that work in the user's local time zone. Calendar dates are
 * stored as "YYYY-MM-DD" strings; parsing them with `new Date("YYYY-MM-DD")`
 * would treat them as UTC and shift them by a day west of Greenwich.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

const pad = (value: number): string => String(value).padStart(2, "0");

export function formatIsoDate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Parses "YYYY-MM-DD" as a local calendar date. Returns null for invalid dates. */
export function parseIsoDate(value: unknown): Date | null {
  if (typeof value !== "string") return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const date = new Date(year, month, day);
  const roundTrips =
    date.getFullYear() === year && date.getMonth() === month && date.getDate() === day;
  return roundTrips ? date : null;
}

export function isIsoDate(value: unknown): value is string {
  return parseIsoDate(value) !== null;
}

/** "HH:MM" in 24-hour time (avoids the "24:05" output some engines give for hour12: false). */
export function formatClockTime(date: Date): string {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/** Adds calendar days, keeping the time of day (safe across daylight-saving changes). */
export function addDays(date: Date, days: number): Date {
  const result = new Date(date.getTime());
  result.setDate(result.getDate() + days);
  return result;
}

/** Whole calendar days from `from` to `to` (negative when `to` is earlier). */
export function calendarDaysBetween(from: Date, to: Date): number {
  return Math.round((startOfDay(to).getTime() - startOfDay(from).getTime()) / DAY_MS);
}

/** Days from today until an ISO date, or null when the date is invalid. */
export function daysUntil(isoDate: string, today: Date = new Date()): number | null {
  const target = parseIsoDate(isoDate);
  return target ? calendarDaysBetween(today, target) : null;
}

/** Monday 00:00 (local time) of the ISO week containing `date`. */
export function startOfIsoWeek(date: Date): Date {
  const day = startOfDay(date);
  const offsetFromMonday = (day.getDay() + 6) % 7;
  return addDays(day, -offsetFromMonday);
}

/** ISO-8601 week identifier such as "2026-W45". */
export function isoWeekId(date: Date): string {
  const thursday = addDays(startOfIsoWeek(date), 3);
  const isoYear = thursday.getFullYear();
  const firstThursday = addDays(startOfIsoWeek(new Date(isoYear, 0, 4)), 3);
  const week = 1 + Math.round((thursday.getTime() - firstThursday.getTime()) / (7 * DAY_MS));
  return `${isoYear}-W${pad(week)}`;
}

/** "Today", "Yesterday", "3 days ago", "2 weeks ago", or a short date. */
export function relativeDayLabel(isoTimestamp: string, now: Date = new Date()): string {
  const date = new Date(isoTimestamp);
  if (Number.isNaN(date.getTime())) return "";
  const days = calendarDaysBetween(date, now);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days > 1 && days < 7) return `${days} days ago`;
  if (days >= 7 && days < 30) {
    const weeks = Math.floor(days / 7);
    return weeks === 1 ? "1 week ago" : `${weeks} weeks ago`;
  }
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function formatLongDate(date: Date): string {
  return date.toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}
