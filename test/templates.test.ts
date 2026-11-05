import { describe, expect, it } from "vitest";
import { DAILY_LOG_HEADING, DEFAULT_SETTINGS, LABBOOK_LOG_HEADING } from "../src/domain/constants";
import {
  dailyNotePath,
  defaultLabbookPath,
  labbookFolderPath,
  labbookNotePath,
  weeklyPlanPath,
  weeklyReportPath,
} from "../src/domain/paths";
import { elapsedMinutes, formatElapsed } from "../src/domain/session";
import {
  dailyNoteTemplate,
  goalTimeEntry,
  labbookTemplate,
  listValue,
  progressEntry,
  sessionStartedEntry,
  weeklyPlanTemplate,
} from "../src/domain/templates";
import { NOW } from "./fixtures";

describe("templates", () => {
  it("creates a daily note with an hourly plan and the log heading", () => {
    const note = dailyNoteTemplate(NOW, () => "Wednesday");
    expect(note.startsWith("# Wednesday\n")).toBe(true);
    expect(note).toContain("- [ ] 08:00 - ");
    expect(note).toContain("- [ ] 17:00 - ");
    expect(note.trimEnd().endsWith(DAILY_LOG_HEADING)).toBe(true);
  });

  it("creates a weekly plan titled with the ISO week number", () => {
    const plan = weeklyPlanTemplate("2026-W45", new Date(2026, 10, 2));
    expect(plan.split("\n")[0]).toMatch(/^# Week 45: /);
    expect(plan).toContain("### Monday");
    expect(plan).toContain("### Friday");
  });

  it("creates a labbook with the running-notes heading", () => {
    const labbook = labbookTemplate("Paper\ninjected", NOW);
    expect(labbook.split("\n")[0]).toBe("# Paper injected labbook");
    expect(labbook).toContain(LABBOOK_LOG_HEADING);
  });

  it("keeps multi-line user text inside list items", () => {
    expect(listValue("line one\nline two")).toBe("line one\n  line two");
    const entry = goalTimeEntry("Paper", 1.5, NOW, "first\nsecond");
    expect(entry).toBe("### ⏱️ Time logged: Paper (10:30)\n- **Hours:** 1.50h\n- **Notes:** first\n  second");
  });

  it("never lets a project name start a new line or heading", () => {
    expect(progressEntry("A\n## Log", 1, NOW, "x").split("\n")[0]).toBe("### 📊 A ## Log (10:30)");
    expect(sessionStartedEntry("Focus", 25, NOW)).not.toContain("Goal");
  });
});

describe("paths", () => {
  it("builds note paths from the folder settings", () => {
    expect(dailyNotePath(DEFAULT_SETTINGS, NOW)).toBe("Mindful Focus/Daily/2026-11-04.md");
    expect(weeklyPlanPath(DEFAULT_SETTINGS, "2026-W45")).toBe("Mindful Focus/Weekly/2026-W45-Plan.md");
    expect(weeklyReportPath(DEFAULT_SETTINGS, "2026-11-02")).toBe("Mindful Focus/Weekly/Weekly_Report_2026-11-02.md");
    expect(defaultLabbookPath(DEFAULT_SETTINGS, "My: project?")).toBe("Mindful Focus/Labbooks/My- project");
  });

  it("resolves labbook notes and folders", () => {
    expect(labbookNotePath("Projects/Paper")).toBe("Projects/Paper/Labbook.md");
    expect(labbookNotePath("Projects/Paper/Log.md")).toBe("Projects/Paper/Log.md");
    expect(labbookFolderPath("Projects/Paper/Log.md")).toBe("Projects/Paper");
    expect(labbookFolderPath("Projects/Paper")).toBe("Projects/Paper");
    expect(labbookFolderPath("Log.md")).toBe("");
  });

  it.each([undefined, "", "../outside", "a/../../b", ".obsidian"])("rejects labbook path %j", (path) => {
    expect(() => labbookNotePath(path)).toThrow();
  });
});

describe("session time", () => {
  it("formats elapsed time", () => {
    expect(formatElapsed(0)).toBe("00:00");
    expect(formatElapsed(65)).toBe("01:05");
    expect(formatElapsed(3600 + 125)).toBe("1:02:05");
    expect(formatElapsed(-5)).toBe("00:00");
  });

  it("never reports negative minutes", () => {
    const session = { focus: "x", plannedMinutes: 30, startedAt: new Date(NOW.getTime() + 60_000).toISOString() };
    expect(elapsedMinutes(session, NOW)).toBe(0);
  });
});
