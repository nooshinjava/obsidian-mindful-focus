import { addDays, formatIsoDate, startOfIsoWeek } from "@orbitkit/shared";
import { ACTIVITY_RETENTION_DAYS } from "./constants";
import type { ActivityEntry, LifeCategory } from "./types";

export interface DateRange {
  /** Inclusive "YYYY-MM-DD". */
  start: string;
  /** Inclusive "YYYY-MM-DD". */
  end: string;
}

/** Monday–Sunday of the ISO week containing `date`. */
export function isoWeekRange(date: Date): DateRange {
  const monday = startOfIsoWeek(date);
  return { start: formatIsoDate(monday), end: formatIsoDate(addDays(monday, 6)) };
}

export function previousWeekRange(date: Date): DateRange {
  return isoWeekRange(addDays(startOfIsoWeek(date), -7));
}

export function entriesInRange(entries: readonly ActivityEntry[], range: DateRange): ActivityEntry[] {
  return entries.filter((entry) => entry.date >= range.start && entry.date <= range.end);
}

/** Drops entries older than the retention window. */
export function pruneActivity(
  entries: readonly ActivityEntry[],
  now: Date,
  retentionDays = ACTIVITY_RETENTION_DAYS,
): ActivityEntry[] {
  const cutoff = formatIsoDate(addDays(now, -retentionDays));
  return entries.filter((entry) => entry.date >= cutoff);
}

/** Hours logged per life-category item in the ISO week containing `date`. */
export function categoryHoursForWeek(entries: readonly ActivityEntry[], date: Date): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const entry of entriesInRange(entries, isoWeekRange(date))) {
    if (entry.kind !== "category" || !entry.category) continue;
    totals[entry.category] = (totals[entry.category] ?? 0) + entry.hours;
  }
  return totals;
}

export interface CategoryProgress {
  key: string;
  category: LifeCategory;
  logged: number;
  percent: number;
  items: Array<{ key: string; logged: number; target: number }>;
}

/** Weekly progress per life category, in the order the categories are defined. */
export function weeklyCategoryProgress(
  categories: Record<string, LifeCategory>,
  targets: Record<string, number>,
  logged: Record<string, number>,
): CategoryProgress[] {
  return Object.entries(categories).map(([key, category]) => {
    const items = category.items.map((item) => ({
      key: item,
      logged: logged[item] ?? 0,
      target: targets[item] ?? 0,
    }));
    const total = items.reduce((sum, item) => sum + item.logged, 0);
    const percent = category.weeklyTarget > 0 ? Math.min(100, Math.round((total / category.weeklyTarget) * 100)) : 0;
    return { key, category, logged: total, percent, items };
  });
}

/** Display name for an item key: custom name, or "family-friends" → "Family Friends". */
export function formatItemName(key: string, names: Record<string, string>): string {
  const custom = names[key];
  if (custom) return custom;
  return key
    .split("-")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function formatHours(hours: number): string {
  return `${hours.toFixed(1)}h`;
}
