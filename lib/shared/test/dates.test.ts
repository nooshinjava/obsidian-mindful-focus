import { describe, expect, it } from "vitest";
import {
  addDays,
  calendarDaysBetween,
  daysUntil,
  formatClockTime,
  formatIsoDate,
  isoWeekId,
  parseIsoDate,
  relativeDayLabel,
  startOfIsoWeek,
} from "../src/dates";

describe("ISO calendar dates", () => {
  it("formats and parses local dates without UTC shifts", () => {
    const date = parseIsoDate("2026-03-09");
    expect(date?.getFullYear()).toBe(2026);
    expect(date?.getMonth()).toBe(2);
    expect(date?.getDate()).toBe(9);
    expect(formatIsoDate(new Date(2026, 0, 5))).toBe("2026-01-05");
  });

  it.each(["2026-02-30", "2026-13-01", "26-01-01", "", "tomorrow", null, 20260101])("rejects %j", (value) => {
    expect(parseIsoDate(value)).toBeNull();
  });
});

describe("day arithmetic", () => {
  it("counts calendar days regardless of time of day", () => {
    expect(calendarDaysBetween(new Date(2026, 0, 1, 23, 59), new Date(2026, 0, 2, 0, 1))).toBe(1);
    expect(calendarDaysBetween(new Date(2026, 0, 10), new Date(2026, 0, 3))).toBe(-7);
  });

  it("computes days until a deadline", () => {
    const today = new Date(2026, 10, 4, 18, 30);
    expect(daysUntil("2026-11-04", today)).toBe(0);
    expect(daysUntil("2026-11-05", today)).toBe(1);
    expect(daysUntil("2026-11-01", today)).toBe(-3);
    expect(daysUntil("not a date", today)).toBeNull();
  });

  it("adds days across month ends", () => {
    expect(formatIsoDate(addDays(new Date(2026, 0, 31), 1))).toBe("2026-02-01");
  });
});

describe("ISO weeks", () => {
  it.each([
    ["2026-01-01", "2026-W01"],
    ["2027-01-01", "2026-W53"],
    ["2024-12-30", "2025-W01"],
    ["2021-01-03", "2020-W53"],
    ["2026-11-04", "2026-W45"],
    ["2026-11-08", "2026-W45"],
    ["2026-11-09", "2026-W46"],
  ])("%s is in %s", (iso, expected) => {
    expect(isoWeekId(parseIsoDate(iso) as Date)).toBe(expected);
  });

  it("starts weeks on Monday", () => {
    expect(formatIsoDate(startOfIsoWeek(new Date(2026, 10, 8)))).toBe("2026-11-02");
    expect(formatIsoDate(startOfIsoWeek(new Date(2026, 10, 2)))).toBe("2026-11-02");
  });
});

describe("formatting", () => {
  it("formats clock time as 24-hour HH:MM", () => {
    expect(formatClockTime(new Date(2026, 0, 1, 0, 5))).toBe("00:05");
    expect(formatClockTime(new Date(2026, 0, 1, 13, 45))).toBe("13:45");
  });

  it("labels relative days", () => {
    const now = new Date(2026, 10, 4, 12);
    expect(relativeDayLabel(new Date(2026, 10, 4, 1).toISOString(), now)).toBe("Today");
    expect(relativeDayLabel(new Date(2026, 10, 3, 1).toISOString(), now)).toBe("Yesterday");
    expect(relativeDayLabel(new Date(2026, 10, 1).toISOString(), now)).toBe("3 days ago");
    expect(relativeDayLabel(new Date(2026, 9, 25).toISOString(), now)).toBe("1 week ago");
    expect(relativeDayLabel("garbage", now)).toBe("");
  });
});
