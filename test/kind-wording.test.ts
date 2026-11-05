import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, LEGACY_DEFAULT_PROMPTS, MAX_SESSION_MINUTES } from "../src/domain/constants";
import { deadlineLabel } from "../src/domain/goals";
import { migrateSettings } from "../src/domain/migrate";
import { clampRecordedMinutes, formatDurationWords, needsCheckIn, startedLabel } from "../src/domain/session";
import { reflectionEntry } from "../src/domain/templates";
import type { ActiveSession } from "../src/domain/types";

const session = (plannedMinutes: number, startedAt: Date): ActiveSession => ({
  focus: "Writing",
  plannedMinutes,
  startedAt: startedAt.toISOString(),
});
const start = new Date(2026, 10, 4, 9, 0);
const after = (minutes: number) => new Date(start.getTime() + minutes * 60_000);

describe("checking in after a session was left open", () => {
  it("only asks when the session ran well past its plan", () => {
    expect(needsCheckIn(session(90, start), after(120), MAX_SESSION_MINUTES)).toBe(false);
    expect(needsCheckIn(session(90, start), after(136), MAX_SESSION_MINUTES)).toBe(true);
    expect(needsCheckIn(session(25, start), after(50), MAX_SESSION_MINUTES)).toBe(false);
    expect(needsCheckIn(session(25, start), after(56), MAX_SESSION_MINUTES)).toBe(true);
    expect(needsCheckIn(session(600, start), after(610), MAX_SESSION_MINUTES)).toBe(true);
  });

  it("keeps the chosen time between zero and the time the session was open", () => {
    expect(clampRecordedMinutes(45.4, 120)).toBe(45);
    expect(clampRecordedMinutes(-10, 120)).toBe(0);
    expect(clampRecordedMinutes(500, 120)).toBe(120);
    expect(clampRecordedMinutes(Number.NaN, 120)).toBe(0);
    expect(clampRecordedMinutes(5000, 10_000)).toBe(1440);
  });

  it("describes durations and start times in plain words", () => {
    expect(formatDurationWords(1)).toBe("1 minute");
    expect(formatDurationWords(45)).toBe("45 minutes");
    expect(formatDurationWords(60)).toBe("1 hour");
    expect(formatDurationWords(130)).toBe("2 hours and 10 minutes");
    expect(formatDurationWords(3120)).toBe("2 days and 4 hours");
    expect(formatDurationWords(2880)).toBe("2 days");
    const clock = (date: Date) => `${date.getHours()}:${String(date.getMinutes()).padStart(2, "0")}`;
    expect(startedLabel(session(90, start), after(30), clock)).toBe("9:00");
    expect(startedLabel(session(90, start), after(24 * 60), clock)).toBe("yesterday at 9:00");
    expect(startedLabel(session(90, start), after(3 * 24 * 60), clock)).toMatch(/^\p{L}+ at 9:00$/u);
  });
});

describe("kind, guilt-free wording", () => {
  it("describes passed deadlines without blame", () => {
    for (const days of [-1, -3, -40]) expect(deadlineLabel(days)).not.toMatch(/overdue|late|fail/i);
  });

  it("only writes the parts of a reflection the user filled in", () => {
    expect(reflectionEntry("", "Call Sam", new Date(2026, 0, 1, 10, 0))).toBe(
      "### 🪞 Session reflection (10:00)\n- **Next step:** Call Sam",
    );
  });

  it("replaces the old default prompts with gentler ones, but keeps prompts the user wrote", () => {
    expect(migrateSettings({ journalPrompts: [...LEGACY_DEFAULT_PROMPTS] }, start).journalPrompts).toEqual(
      DEFAULT_SETTINGS.journalPrompts,
    );
    expect(migrateSettings({ journalPrompts: ["My own prompt"] }, start).journalPrompts).toEqual(["My own prompt"]);
    for (const prompt of DEFAULT_SETTINGS.journalPrompts) expect(prompt).not.toMatch(/must|avoid|ONE/);
  });
});
