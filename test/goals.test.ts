import { describe, expect, it } from "vitest";
import {
  buildGoalFromInput,
  deadlineLabel,
  formatMilestones,
  isAtRisk,
  parseHours,
  parseLabbookPath,
  parseMilestones,
  progressPercent,
  requiredHoursPerDay,
  sortGoals,
  toGoalStatus,
  toPriority,
  urgencyOf,
  urgencyScore,
} from "../src/domain/goals";
import { goal, NOW } from "./fixtures";

describe("urgency", () => {
  it.each([
    ["2026-11-03", "overdue"],
    ["2026-11-04", "critical"],
    ["2026-11-07", "critical"],
    ["2026-11-08", "high"],
    ["2026-11-11", "high"],
    ["2026-11-12", "medium"],
    ["2026-11-18", "medium"],
    ["2026-11-19", "low"],
    ["not-a-date", "low"],
  ])("deadline %s is %s", (deadline, expected) => {
    expect(urgencyOf(goal({ deadline }), NOW)).toBe(expected);
  });

  it("treats completed goals as completed regardless of deadline", () => {
    expect(urgencyOf(goal({ deadline: "2020-01-01", status: "completed" }), NOW)).toBe("completed");
  });

  it("scores priority plus deadline proximity", () => {
    expect(urgencyScore(goal({ priority: "critical", deadline: "2026-11-01" }), NOW)).toBe(300);
    expect(urgencyScore(goal({ priority: "low", deadline: "2027-01-01" }), NOW)).toBe(5);
  });

  it("sorts by urgency with completed goals last", () => {
    const sorted = sortGoals(
      [
        goal({ id: "done", name: "Done", priority: "critical", deadline: "2026-11-01", status: "completed" }),
        goal({ id: "later", name: "Later", priority: "low", deadline: "2027-01-01" }),
        goal({ id: "soon", name: "Soon", priority: "medium", deadline: "2026-11-05" }),
        goal({ id: "overdue", name: "Overdue", priority: "low", deadline: "2026-10-30" }),
      ],
      NOW,
    );
    expect(sorted.map((item) => item.id)).toEqual(["overdue", "soon", "later", "done"]);
  });
});

describe("labels and progress", () => {
  it.each([
    [null, "No deadline set"],
    [-1, "Deadline was yesterday"],
    [-3, "Deadline passed 3 days ago"],
    [0, "Due today"],
    [1, "Due tomorrow"],
    [9, "9 days left"],
  ])("deadlineLabel(%j)", (days, expected) => {
    expect(deadlineLabel(days)).toBe(expected);
  });

  it("caps progress at 100%", () => {
    expect(progressPercent(goal({ hoursLogged: 2.5, estimatedHours: 10 }))).toBe(25);
    expect(progressPercent(goal({ hoursLogged: 30, estimatedHours: 10 }))).toBe(100);
  });

  it("flags goals at risk", () => {
    expect(isAtRisk(goal({ deadline: "2026-11-08", hoursLogged: 4 }), NOW)).toBe(true);
    expect(isAtRisk(goal({ deadline: "2026-11-08", hoursLogged: 6 }), NOW)).toBe(false);
    expect(isAtRisk(goal({ deadline: "2026-12-30", status: "at-risk" }), NOW)).toBe(true);
    expect(isAtRisk(goal({ deadline: "2026-11-01", status: "completed" }), NOW)).toBe(false);
  });

  it("never asks for negative hours per day", () => {
    expect(requiredHoursPerDay(goal({ deadline: "2026-11-09", estimatedHours: 10, hoursLogged: 5 }), NOW)).toBe(1);
    expect(requiredHoursPerDay(goal({ estimatedHours: 10, hoursLogged: 15 }), NOW)).toBe(0);
    expect(requiredHoursPerDay(goal({ deadline: "2026-11-01", estimatedHours: 10, hoursLogged: 4 }), NOW)).toBe(6);
  });
});

describe("milestones", () => {
  it("round-trips through the text format", () => {
    const text = "[x] Draft\nAnalysis\n\n  [X]   Submit  \n[ ] Review";
    const milestones = parseMilestones(text);
    expect(milestones).toEqual([
      { text: "Draft", done: true },
      { text: "Analysis", done: false },
      { text: "Submit", done: true },
      { text: "Review", done: false },
    ]);
    expect(parseMilestones(formatMilestones(milestones))).toEqual(milestones);
  });
});

describe("normalizers", () => {
  it.each([
    ["Critical", "critical"],
    ["HIGH", "high"],
    [undefined, "medium"],
    ["urgent", "medium"],
  ])("priority %j → %s", (value, expected) => {
    expect(toPriority(value)).toBe(expected);
  });

  it.each([
    ["Not started", "not-started"],
    ["In progress", "in-progress"],
    ["At risk", "at-risk"],
    ["Completed", "completed"],
    ["completed", "completed"],
    [null, "not-started"],
  ])("status %j → %s", (value, expected) => {
    expect(toGoalStatus(value)).toBe(expected);
  });

  it("parses hours within limits", () => {
    expect(parseHours("1.5")).toBe(1.5);
    expect(parseHours(0.333)).toBe(0.33);
    expect(parseHours("0")).toBeNull();
    expect(parseHours("0", { allowZero: true })).toBe(0);
    expect(parseHours("-1", { allowZero: true })).toBeNull();
    expect(parseHours("25")).toBeNull();
    expect(parseHours("abc")).toBeNull();
    expect(parseHours("")).toBeNull();
  });

  it("validates labbook paths", () => {
    expect(parseLabbookPath("")).toEqual({ ok: true, path: null });
    expect(parseLabbookPath(" /Projects//Paper/ ")).toEqual({ ok: true, path: "Projects/Paper" });
    expect(parseLabbookPath("../outside").ok).toBe(false);
    expect(parseLabbookPath(".obsidian/plugins").ok).toBe(false);
  });
});

describe("buildGoalFromInput", () => {
  const input = {
    name: "  Thesis  ",
    deadline: "2026-12-01",
    priority: "high",
    estimatedHours: "40",
    status: "in-progress",
    labbookPath: "Projects/Thesis",
    milestones: "[x] Outline\nChapter 1",
  };

  it("builds a valid goal", () => {
    const result = buildGoalFromInput(input, null, "new-id");
    expect(result).toEqual({
      ok: true,
      goal: {
        id: "new-id",
        name: "Thesis",
        deadline: "2026-12-01",
        priority: "high",
        estimatedHours: 40,
        hoursLogged: 0,
        status: "in-progress",
        labbookPath: "Projects/Thesis",
        milestones: [
          { text: "Outline", done: true },
          { text: "Chapter 1", done: false },
        ],
      },
    });
  });

  it("keeps the id and logged hours of an existing goal and can remove its labbook", () => {
    const existing = goal({ id: "keep", hoursLogged: 7, labbookPath: "Old" });
    const result = buildGoalFromInput({ ...input, labbookPath: "" }, existing, "unused");
    expect(result.ok && result.goal.id).toBe("keep");
    expect(result.ok && result.goal.hoursLogged).toBe(7);
    expect(result.ok && "labbookPath" in result.goal).toBe(false);
  });

  it.each([
    [{ name: " " }, "name"],
    [{ deadline: "2026-02-30" }, "deadline"],
    [{ estimatedHours: "0" }, "estimate between"],
    [{ estimatedHours: "-5" }, "estimate between"],
    [{ estimatedHours: "lots" }, "estimate between"],
    [{ labbookPath: "../../x" }, "vault-relative"],
  ])("rejects %j", (override, message) => {
    const result = buildGoalFromInput({ ...input, ...override }, null, "id");
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toContain(message);
  });
});
