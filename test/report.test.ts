import { describe, expect, it } from "vitest";
import { categoryHoursForWeek, isoWeekRange, previousWeekRange, pruneActivity, weeklyCategoryProgress } from "../src/domain/activity";
import { DEFAULT_SETTINGS } from "../src/domain/constants";
import { buildWeeklyReport, makeProgressBar, summarizeWeek } from "../src/domain/report";
import type { ActivityEntry } from "../src/domain/types";
import { goal, NOW } from "./fixtures";

let counter = 0;
function entry(overrides: Partial<ActivityEntry>): ActivityEntry {
  counter += 1;
  return { id: `e${counter}`, date: "2026-11-04", kind: "project", label: "Project", hours: 1, ...overrides };
}

const goals = [goal({ id: "g1", name: "Paper | draft", deadline: "2026-11-06", estimatedHours: 10, hoursLogged: 2 })];

describe("week ranges", () => {
  it("uses ISO weeks from Monday to Sunday", () => {
    expect(isoWeekRange(NOW)).toEqual({ start: "2026-11-02", end: "2026-11-08" });
    expect(previousWeekRange(NOW)).toEqual({ start: "2026-10-26", end: "2026-11-01" });
    expect(isoWeekRange(new Date(2026, 10, 8, 23, 59))).toEqual({ start: "2026-11-02", end: "2026-11-08" });
  });
});

describe("summarizeWeek", () => {
  const activity = [
    entry({ date: "2026-11-01", kind: "project", label: "Last week", hours: 2 }),
    entry({ date: "2026-11-02", kind: "goal", label: "Old goal name", goalId: "g1", hours: 1.5 }),
    entry({ date: "2026-11-08", kind: "session", label: "Writing", goalId: "g1", hours: 1 }),
    entry({ date: "2026-11-04", kind: "session", label: "Email", hours: 0.5 }),
    entry({ date: "2026-11-05", kind: "project", label: "Side project", hours: 2 }),
    entry({ date: "2026-11-05", kind: "project", label: "Side project", hours: 0.25 }),
    entry({ date: "2026-11-05", kind: "category", label: "reading", category: "reading", hours: 3 }),
    entry({ date: "2026-11-09", kind: "project", label: "Next week", hours: 5 }),
  ];
  const summary = summarizeWeek(activity, goals, isoWeekRange(NOW));

  it("counts each entry once and only inside the week", () => {
    expect(summary.sessions).toBe(2);
    expect(summary.sessionHours).toBe(1.5);
    expect(summary.goalHours).toEqual({ g1: 2.5 });
    expect(summary.projectHours).toEqual({ "Paper | draft": 2.5, "Side project": 2.25 });
    expect(summary.categoryHours).toEqual({ reading: 3 });
  });

  it("puts the previous week's entries in the previous week", () => {
    expect(summarizeWeek(activity, goals, previousWeekRange(NOW)).projectHours).toEqual({ "Last week": 2 });
  });
});

describe("buildWeeklyReport", () => {
  const activity = [
    entry({ date: "2026-10-28", kind: "session", label: "Focus", goalId: "g1", hours: 1 }),
    entry({ date: "2026-11-03", kind: "session", label: "Focus", goalId: "g1", hours: 3 }),
    entry({ date: "2026-11-03", kind: "category", label: "reading", category: "reading", hours: 2 }),
  ];
  const report = buildWeeklyReport({ goals, activity, categoryNames: {}, today: NOW, generatedAt: NOW });

  it("names the report after the ISO week's Monday", () => {
    expect(report.weekStart).toBe("2026-11-02");
    expect(report.markdown).toContain("**Week:** 2026-11-02 to 2026-11-08");
  });

  it("compares with the previous week", () => {
    expect(report.markdown).toContain("- **Focus sessions:** 1 (last week: 1)");
    expect(report.markdown).toContain("- **Focus hours:** 3.0h (last week: 1.0h)");
    expect(report.markdown).toContain("| Paper \\| draft | 3.0h | 1.0h | ↗ +2.0h (+200%) |");
    expect(report.markdown).toContain("🚀 Strong week");
  });

  it("lists active goals with progress and risk", () => {
    expect(report.markdown).toContain("| Paper \\| draft | 2026-11-06 | ██░░░░░░░░ 20% | 3.0h | 🌱 Needs attention |");
    expect(report.markdown).toContain("| Reading | 2.0h | 0.0h |");
  });

  it("handles an empty log", () => {
    const empty = buildWeeklyReport({ goals: [], activity: [], categoryNames: {}, today: NOW, generatedAt: NOW });
    expect(empty.markdown).toContain("*No project hours logged this week.*");
    expect(empty.markdown).toContain("*No active goals.*");
  });

  it("draws bounded progress bars", () => {
    expect(makeProgressBar(0)).toBe("░".repeat(10));
    expect(makeProgressBar(150)).toBe("█".repeat(10));
  });
});

describe("weekly category tracking", () => {
  const activity = [
    entry({ date: "2026-11-02", kind: "category", category: "deep-work", hours: 2 }),
    entry({ date: "2026-11-04", kind: "category", category: "deep-work", hours: 1.5 }),
    entry({ date: "2026-11-01", kind: "category", category: "deep-work", hours: 9 }),
    entry({ date: "2026-11-04", kind: "category", category: "reading", hours: 1 }),
    entry({ date: "2026-11-04", kind: "project", label: "Not a category", hours: 4 }),
  ];

  it("sums this week's category time", () => {
    expect(categoryHoursForWeek(activity, NOW)).toEqual({ "deep-work": 3.5, reading: 1 });
  });

  it("computes category progress in definition order", () => {
    const progress = weeklyCategoryProgress(
      DEFAULT_SETTINGS.lifeCategories,
      DEFAULT_SETTINGS.weeklyTargets,
      categoryHoursForWeek(activity, NOW),
    );
    expect(progress.map((item) => [item.key, item.logged, item.percent])).toEqual([
      ["work", 3.5, 12],
      ["growth", 1, 17],
      ["life", 0, 0],
    ]);
  });

  it("prunes entries beyond the retention window", () => {
    const old = entry({ date: "2025-01-01" });
    const recent = entry({ date: "2026-10-01" });
    expect(pruneActivity([old, recent], NOW)).toEqual([recent]);
  });
});
