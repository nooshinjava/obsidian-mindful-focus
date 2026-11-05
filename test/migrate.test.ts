import { describe, expect, it } from "vitest";
import { DEFAULT_CATEGORY_COLOR, DEFAULT_SETTINGS, SCHEMA_VERSION } from "../src/domain/constants";
import { dataStatus, isHexColor, legacyWeekId, migrateSettings, parseLegacySession } from "../src/domain/migrate";
import { goal, NOW } from "./fixtures";

function v1Data() {
  return {
    liveFolderPath: "Journal/Daily/",
    weeklyFolderPath: "../outside",
    labbookFolderPath: "Labs",
    defaultSessionDuration: 45,
    breakDuration: 20,
    enableStatusBar: false,
    journalPrompts: ["Why?", 3, "  "],
    goals: [
      {
        id: "1",
        name: "Paper",
        deadline: "2026-11-10",
        priority: "Critical",
        estimatedHours: 20,
        hoursLogged: 5,
        status: "In progress",
        labbookPath: "Projects/Paper",
        milestones: [{ text: "Draft", done: true }, { text: "", done: false }, "junk"],
      },
      { id: "2", name: "Done goal", deadline: "2026-10-01", priority: "Low", estimatedHours: 0, status: "Completed" },
      { id: "3", name: "Lower-case done", deadline: "bad", status: "completed", labbookPath: "../../etc" },
      { id: "1", name: "Duplicate id", deadline: "2026-12-01", priority: "High", status: "Not started" },
      { name: "" },
      null,
      "garbage",
    ],
    lifeCategories: {
      work: { name: "Work", color: "red; background: url(x)", weeklyTarget: 30, items: ["deep-work", "deep-work", 4] },
    },
    weeklyTargets: { "deep-work": 20, writing: "x" },
    categoryNames: { "deep-work": "🧠 Deep work", bad: 5 },
    weeklyTracking: { currentWeek: legacyWeekId(NOW), logged: { "deep-work": 3.5, writing: 0, reading: "2" } },
  };
}

describe("migrateSettings from v1", () => {
  const settings = migrateSettings(v1Data(), NOW);

  it("renames and validates settings", () => {
    expect(settings.schemaVersion).toBe(SCHEMA_VERSION);
    expect(settings.dailyFolderPath).toBe("Journal/Daily");
    expect(settings.weeklyFolderPath).toBe(DEFAULT_SETTINGS.weeklyFolderPath);
    expect(settings.labbookFolderPath).toBe("Labs");
    expect(settings.defaultSessionMinutes).toBe(45);
    expect(settings.showStatusBar).toBe(false);
    expect(settings.journalPrompts).toEqual(["Why?"]);
    expect(settings).not.toHaveProperty("breakDuration");
    expect(settings).not.toHaveProperty("weeklyTracking");
    expect(settings).not.toHaveProperty("liveFolderPath");
  });

  it("normalizes goal priorities and statuses, including both spellings of completed", () => {
    expect(settings.goals.map((goal) => [goal.name, goal.priority, goal.status])).toEqual([
      ["Paper", "critical", "in-progress"],
      ["Done goal", "low", "completed"],
      ["Lower-case done", "medium", "completed"],
      ["Duplicate id", "high", "not-started"],
    ]);
  });

  it("repairs invalid goal fields and drops unsafe labbook paths", () => {
    const [paper, done, lower, duplicate] = settings.goals;
    expect(paper?.labbookPath).toBe("Projects/Paper");
    expect(paper?.milestones).toEqual([{ text: "Draft", done: true }]);
    expect(done?.estimatedHours).toBe(10);
    expect(lower?.deadline).toBe("2026-11-04");
    expect(lower?.labbookPath).toBeUndefined();
    expect(duplicate?.id).not.toBe("1");
    expect(new Set(settings.goals.map((goal) => goal.id)).size).toBe(4);
  });

  it("validates categories, colours and maps", () => {
    expect(settings.lifeCategories.work).toEqual({
      name: "Work",
      color: DEFAULT_CATEGORY_COLOR,
      weeklyTarget: 30,
      items: ["deep-work"],
    });
    expect(settings.weeklyTargets).toEqual({ "deep-work": 20 });
    expect(settings.categoryNames).toEqual({ "deep-work": "🧠 Deep work" });
  });

  it("turns this week's v1 totals into category activity entries", () => {
    expect(settings.activity.map((entry) => [entry.kind, entry.category, entry.hours, entry.date])).toEqual([
      ["category", "deep-work", 3.5, "2026-11-04"],
      ["category", "reading", 2, "2026-11-04"],
    ]);
  });

  it("drops v1 totals from an earlier week", () => {
    const data = { ...v1Data(), weeklyTracking: { currentWeek: "2020-W01", logged: { reading: 4 } } };
    expect(migrateSettings(data, NOW).activity).toEqual([]);
  });

  it("is idempotent", () => {
    expect(migrateSettings(JSON.parse(JSON.stringify(settings)), NOW)).toEqual(settings);
  });
});

describe("migrateSettings edge cases", () => {
  it.each([null, undefined, "text", 42, []])("returns defaults for %j", (raw) => {
    expect(migrateSettings(raw, NOW)).toEqual(DEFAULT_SETTINGS);
  });

  it("never shares default objects between loads", () => {
    const first = migrateSettings(null, NOW);
    first.goals.push(goal());
    first.lifeCategories.work!.items.push("extra");
    const second = migrateSettings(null, NOW);
    expect(second.goals).toEqual([]);
    expect(second.lifeCategories.work!.items).not.toContain("extra");
    expect(DEFAULT_SETTINGS.goals).toEqual([]);
  });

  it("prunes old and invalid activity and clamps values", () => {
    const settings = migrateSettings(
      {
        schemaVersion: 2,
        activity: [
          { id: "a", date: "2020-01-01", kind: "project", label: "Old", hours: 1 },
          { id: "b", date: "2026-11-03", kind: "project", label: "Recent", hours: 99 },
          { id: "c", date: "2026-11-03", kind: "category", label: "x", hours: 1 },
          { id: "d", date: "not a date", kind: "goal", label: "x", hours: 1 },
          { id: "e", date: "2026-11-03", kind: "weird", label: "", hours: 2 },
        ],
      },
      NOW,
    );
    expect(settings.activity.map((entry) => [entry.id, entry.kind, entry.label, entry.hours])).toEqual([
      ["b", "project", "Recent", 24],
      ["e", "project", "Untitled", 2],
    ]);
  });

  it("keeps a valid active session and drops one from the future", () => {
    const valid = { focus: "Write", plannedMinutes: 30, startedAt: "2026-11-04T09:00:00.000Z", goalId: "g" };
    expect(migrateSettings({ activeSession: valid }, NOW).activeSession).toEqual(valid);
    const future = { ...valid, startedAt: new Date(NOW.getTime() + 3_600_000).toISOString() };
    expect(migrateSettings({ activeSession: future }, NOW).activeSession).toBeNull();
  });
});

describe("legacy helpers", () => {
  it("imports the v1 localStorage session", () => {
    const json = JSON.stringify({
      session: { focus: "Deep work", duration: 90 },
      startTime: "2026-11-04T08:00:00.000Z",
      goal: { id: "g1", name: "Paper" },
    });
    expect(parseLegacySession(json, NOW)).toEqual({
      focus: "Deep work",
      plannedMinutes: 90,
      startedAt: "2026-11-04T08:00:00.000Z",
      goalId: "g1",
    });
  });

  it.each([null, "", "{", "[]", '{"session":{}}'])("ignores unusable legacy session %j", (json) => {
    expect(parseLegacySession(json, NOW)).toBeNull();
  });

  it("classifies stored data versions", () => {
    expect(dataStatus(null)).toBe("outdated");
    expect(dataStatus(v1Data())).toBe("outdated");
    expect(dataStatus({ schemaVersion: SCHEMA_VERSION })).toBe("current");
    expect(dataStatus({ schemaVersion: SCHEMA_VERSION + 1 })).toBe("newer");
  });

  it("validates hex colours", () => {
    expect(isHexColor("#abc")).toBe(true);
    expect(isHexColor("#a1b2c3")).toBe(true);
    expect(isHexColor("red")).toBe(false);
    expect(isHexColor("#abcd")).toBe(false);
  });
});
