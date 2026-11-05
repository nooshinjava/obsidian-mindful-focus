import { describe, expect, it } from "vitest";
import { DAILY_LOG_HEADING, LABBOOK_LOG_HEADING, SCHEMA_VERSION } from "../src/domain/constants";
import type { MindfulFocusSettings } from "../src/domain/types";
import { goal, setup } from "./fixtures";

const DAILY = "Mindful Focus/Daily/2026-11-04.md";
const LABBOOK = "Projects/Paper/Labbook.md";

function count(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

describe("loading data", () => {
  it("saves the migrated v1 shape once", async () => {
    const { persistence, services } = await setup({ liveFolderPath: "Daily", goals: [] });
    expect(persistence.saves).toBe(1);
    expect((persistence.data as MindfulFocusSettings).schemaVersion).toBe(SCHEMA_VERSION);
    expect(services.state.settings.dailyFolderPath).toBe("Daily");
  });

  it("saves defaults on a fresh install", async () => {
    const { persistence, services } = await setup();
    expect(persistence.saves).toBe(1);
    expect(services.state.loadedStatus).toBe("outdated");
  });

  it("does not rewrite current data on load", async () => {
    const { persistence, services } = await setup({ schemaVersion: SCHEMA_VERSION });
    expect(persistence.saves).toBe(0);
    expect(services.state.loadedStatus).toBe("current");
  });

  it("reports data from a newer version without saving over it", async () => {
    const { persistence, services } = await setup({ schemaVersion: SCHEMA_VERSION + 1, goals: [] });
    expect(services.state.loadedStatus).toBe("newer");
    expect(persistence.saves).toBe(0);
  });
});

describe("daily log", () => {
  it("keeps $ patterns from user text and existing note content", async () => {
    const existing = `# My day\n\nPersonal notes stay.\n\n${DAILY_LOG_HEADING}\n\n### Earlier\n- kept\n`;
    const { store, services } = await setup(undefined, { [DAILY]: existing });
    await services.tracking.journal("Costs $& and $1 and $$ and $'");
    const note = store.files.get(DAILY) ?? "";
    expect(note).toContain("Costs $& and $1 and $$ and $'");
    expect(note).toContain("Personal notes stay.");
    expect(note).toContain("### Earlier\n- kept");
    expect(note.indexOf("Journal entry")).toBeLessThan(note.indexOf("### Earlier"));
  });

  it("creates today's note on first log and handles concurrent writes", async () => {
    const { store, services } = await setup();
    await Promise.all(["one", "two", "three", "four"].map((text) => services.tracking.journal(text)));
    const note = store.files.get(DAILY) ?? "";
    expect(count(note, DAILY_LOG_HEADING)).toBe(1);
    for (const text of ["one", "two", "three", "four"]) expect(note).toContain(text);
  });

  it("never overwrites an existing daily note", async () => {
    const { store, services } = await setup(undefined, { [DAILY]: "mine" });
    await expect(services.notes.ensureDailyNote(new Date(2026, 10, 4))).resolves.toEqual({ path: DAILY, created: false });
    expect(store.files.get(DAILY)).toBe("mine");
  });
});

describe("focus sessions", () => {
  it("records exactly one activity entry and adds goal hours once", async () => {
    const { clock, store, persistence, services } = await setup({
      schemaVersion: 2,
      goals: [goal({ id: "g1", labbookPath: "Projects/Paper" })],
    });
    await services.sessions.start("Write intro", 50, "g1");
    expect(services.sessions.active).toMatchObject({ focus: "Write intro", plannedMinutes: 50, goalId: "g1" });
    await expect(services.sessions.start("Again", 10)).rejects.toThrow("already running");

    clock.advanceMinutes(30);
    const completed = await services.sessions.end();
    expect(completed).toEqual({ focus: "Write intro", minutes: 30, goalId: "g1", goalName: "Paper" });
    expect(services.sessions.active).toBeNull();

    const saved = persistence.data as MindfulFocusSettings;
    expect(saved.activeSession).toBeNull();
    expect(saved.activity).toHaveLength(1);
    expect(saved.activity[0]).toMatchObject({ kind: "session", hours: 0.5, goalId: "g1", label: "Write intro" });
    expect(saved.goals[0]).toMatchObject({ hoursLogged: 0.5, status: "in-progress" });

    const daily = store.files.get(DAILY) ?? "";
    expect(daily).toContain("Focus session started");
    expect(daily).toContain("Focus session completed");
    expect(daily).toContain("- **Duration:** 30 minutes");
    expect(store.files.get(LABBOOK)).toContain("- **Focus session:** 0.50h");

    await expect(services.sessions.end()).resolves.toBeNull();
  });

  it("appends an optional reflection to the daily note and the labbook", async () => {
    const { clock, store, services } = await setup({ schemaVersion: 2, goals: [goal({ labbookPath: "Projects/Paper" })] });
    await services.sessions.start("Analysis", 30, "g1");
    clock.advanceMinutes(10);
    const completed = await services.sessions.end();
    expect(await services.sessions.saveReflection(completed!, "", "  ")).toBe(false);
    expect(await services.sessions.saveReflection(completed!, "Ran models $1", "Check outliers")).toBe(true);
    expect(store.files.get(DAILY)).toContain("- **Worked on:** Ran models $1");
    const labbook = store.files.get(LABBOOK) ?? "";
    expect(labbook.indexOf(LABBOOK_LOG_HEADING)).toBeLessThan(labbook.indexOf("session reflection"));
    expect(labbook).toContain("- **Next step:** Check outliers");
  });

  it("caps a session that was left running", async () => {
    const { clock, services } = await setup({ schemaVersion: 2, goals: [goal()] });
    await services.sessions.start("Forgot to stop", 60, "g1");
    clock.advanceMinutes(3 * 24 * 60);
    const completed = await services.sessions.end();
    expect(completed).toMatchObject({ minutes: 600, capped: true });
    expect(services.state.settings.goals[0]?.hoursLogged).toBe(10);
  });

  it("records exactly what the user chose after a session was left open", async () => {
    const { clock, store, services } = await setup({ schemaVersion: 2, goals: [goal()] });
    await services.sessions.start("Left running", 90, "g1");
    clock.advanceMinutes(2 * 24 * 60);
    const completed = await services.sessions.end({ recordMinutes: 45 });
    expect(completed).toMatchObject({ minutes: 45, checkedIn: true });
    expect(completed).not.toHaveProperty("capped");
    expect(services.state.settings.goals[0]?.hoursLogged).toBe(0.75);
    // The entry goes into the note of the day the session was closed.
    expect(store.files.get("Mindful Focus/Daily/2026-11-06.md") ?? "").toContain("- **Duration:** 45 minutes");
  });

  it("closes a session without recording time when the user prefers", async () => {
    const { clock, store, services } = await setup({ schemaVersion: 2, goals: [goal()] });
    await services.sessions.start("Never mind", 30, "g1");
    clock.advanceMinutes(300);
    await expect(services.sessions.end({ recordMinutes: 0 })).resolves.toMatchObject({ minutes: 0, checkedIn: true });
    expect(services.state.settings.activity).toHaveLength(0);
    expect(services.state.settings.goals[0]?.hoursLogged).toBe(0);
    const daily = store.files.get(DAILY) ?? "";
    expect(daily).toContain("Focus session closed");
    expect(daily).toContain("no time recorded");
  });

  it("never records more than the session was actually open", async () => {
    const { clock, services } = await setup({ schemaVersion: 2 });
    await services.sessions.start("Short", 30);
    clock.advanceMinutes(40);
    await expect(services.sessions.end({ recordMinutes: 500 })).resolves.toMatchObject({ minutes: 40 });
  });

  it("validates new sessions", async () => {
    const { services } = await setup();
    await expect(services.sessions.start("  ", 30)).rejects.toThrow("focus on");
    await expect(services.sessions.start("Work", 0)).rejects.toThrow("duration");
    await expect(services.sessions.start("Work", 601)).rejects.toThrow("duration");
  });
});

describe("goal time and progress", () => {
  it("logs progress on a goal exactly once", async () => {
    const { store, persistence, services } = await setup({ schemaVersion: 2, goals: [goal()] });
    await services.tracking.logProgress("Paper", "2", "Wrote methods", "g1");
    const saved = persistence.data as MindfulFocusSettings;
    expect(saved.activity).toHaveLength(1);
    expect(saved.activity[0]).toMatchObject({ kind: "goal", goalId: "g1", hours: 2 });
    expect(saved.goals[0]?.hoursLogged).toBe(2);
    const daily = store.files.get(DAILY) ?? "";
    expect(count(daily, "Time logged: Paper")).toBe(1);
    expect(daily).not.toContain("📊");
  });

  it("logs progress without a goal as a project entry", async () => {
    const { store, persistence, services } = await setup();
    await services.tracking.logProgress("Grant", "1.5", "Budget draft");
    expect((persistence.data as MindfulFocusSettings).activity[0]).toMatchObject({ kind: "project", label: "Grant", hours: 1.5 });
    expect(store.files.get(DAILY)).toContain("### 📊 Grant");
    await services.tracking.logProgress("Grant", "0", "Just a note");
    expect((persistence.data as MindfulFocusSettings).activity).toHaveLength(1);
  });

  it.each(["0", "-1", "25", "abc", ""])("rejects %j hours for goal time", async (hours) => {
    const { services } = await setup({ schemaVersion: 2, goals: [goal()] });
    await expect(services.goals.logTime("g1", hours)).rejects.toThrow("hours between");
  });

  it("rejects time for a deleted goal", async () => {
    const { services } = await setup({ schemaVersion: 2, goals: [goal()] });
    await services.goals.remove("g1");
    await expect(services.goals.logTime("g1", 1)).rejects.toThrow("no longer exists");
  });

  it("completes goals and toggles milestones", async () => {
    const { services } = await setup({
      schemaVersion: 2,
      goals: [goal({ milestones: [{ text: "Draft", done: false }] })],
    });
    await services.goals.toggleMilestone("g1", 0);
    await services.goals.toggleMilestone("g1", 5);
    await services.goals.complete("g1");
    expect(services.state.settings.goals[0]).toMatchObject({ status: "completed", milestones: [{ text: "Draft", done: true }] });
  });

  it("logs weekly category time", async () => {
    const { store, services } = await setup();
    await expect(services.tracking.logCategoryTime("unknown", 1)).rejects.toThrow("Choose a category");
    await expect(services.tracking.logCategoryTime("reading", "1.25", "Novel")).resolves.toBe("Reading");
    expect(services.tracking.weeklyCategoryHours()).toEqual({ reading: 1.25 });
    expect(store.files.get(DAILY)).toContain("### ⏱️ Reading");
  });
});

describe("labbooks", () => {
  it("creates the labbook once and appends under running notes", async () => {
    const custom = `# Paper labbook\n\nMy notes.\n\n${LABBOOK_LOG_HEADING}\n\n### Old\n- entry\n`;
    const { store, services } = await setup({ schemaVersion: 2, goals: [goal({ labbookPath: "Projects/Paper" })] }, { [LABBOOK]: custom });
    await expect(services.notes.ensureLabbook(services.state.settings.goals[0]!)).resolves.toEqual({ path: LABBOOK, created: false });
    await services.goals.logTime("g1", 1, "Note with $&");
    const labbook = store.files.get(LABBOOK) ?? "";
    expect(labbook).toContain("My notes.");
    expect(labbook).toContain("- **Notes:** Note with $&");
    expect(labbook.indexOf("Note with")).toBeLessThan(labbook.indexOf("### Old"));
  });

  it("supports a labbook that is a note path", async () => {
    const { store, services } = await setup({ schemaVersion: 2, goals: [goal({ labbookPath: "Projects/Log.md" })] });
    await services.goals.logTime("g1", 1);
    expect(store.files.get("Projects/Log.md")).toContain(LABBOOK_LOG_HEADING);
  });

  it("rejects labbook paths that escape the vault", async () => {
    const { services } = await setup();
    await services.goals.save(goal({ labbookPath: "../outside" }));
    await expect(services.notes.ensureLabbook(services.state.settings.goals[0]!)).rejects.toThrow("inside this vault");
    await expect(services.goals.logTime("g1", 1)).rejects.toThrow("inside this vault");
  });

  it("creates labbook notes without overwriting existing ones", async () => {
    const { store, services } = await setup({ schemaVersion: 2, goals: [goal({ labbookPath: "Projects/Paper" })] });
    const target = services.state.settings.goals[0]!;
    const first = await services.notes.createLabbookNote(target, "2026-11-04 - Notes", "First thoughts");
    expect(first).toEqual({ path: "Projects/Paper/2026-11-04 - Notes.md", created: true });
    const second = await services.notes.createLabbookNote(target, "2026-11-04 - Notes", "More thoughts");
    expect(second.created).toBe(false);
    const note = store.files.get(first.path) ?? "";
    expect(note).toContain("First thoughts");
    expect(note).toContain("More thoughts");
  });

  it("needs a folder for extra labbook notes", async () => {
    const { services } = await setup({ schemaVersion: 2, goals: [goal({ labbookPath: "Log.md" })] });
    await expect(services.notes.createLabbookNote(services.state.settings.goals[0]!, "x", "")).rejects.toThrow("folder");
  });
});

describe("weekly plans and reports", () => {
  it("opens an existing plan without overwriting it and creates new ones", async () => {
    const plan = "Mindful Focus/Weekly/2026-W45-Plan.md";
    const { store, services } = await setup(undefined, { [plan]: "my plan" });
    await expect(services.notes.ensureWeeklyPlan(new Date(2026, 10, 8))).resolves.toEqual({ path: plan, created: false });
    expect(store.files.get(plan)).toBe("my plan");
    const next = await services.notes.ensureWeeklyPlan(new Date(2026, 10, 9));
    expect(next).toEqual({ path: "Mindful Focus/Weekly/2026-W46-Plan.md", created: true });
    expect(services.notes.weeklyPlanPath(new Date(2026, 10, 2))).toBe(plan);
  });

  it("never replaces a note of the user's that has the report's name", async () => {
    const mine = "Mindful Focus/Weekly/Weekly_Report_2026-11-02.md";
    const { store, services } = await setup({ schemaVersion: 2, goals: [goal()] }, { [mine]: "my own notes" });
    const path = await services.tracking.generateWeeklyReport();
    expect(path).toBe("Mindful Focus/Weekly/Weekly_Report_2026-11-02 1.md");
    expect(store.files.get(mine)).toBe("my own notes");
    expect(store.frontmatterOf(path)).toEqual({ "mindful-focus-report": true });
    await expect(services.tracking.generateWeeklyReport()).resolves.toBe(path);
  });

  it("writes the weekly report into the weekly folder and regenerates it", async () => {
    const { store, services } = await setup({ schemaVersion: 2, goals: [goal()] });
    await services.goals.logTime("g1", 2);
    const path = await services.tracking.generateWeeklyReport();
    expect(path).toBe("Mindful Focus/Weekly/Weekly_Report_2026-11-02.md");
    expect(store.files.get(path)).toContain("| Paper | 2.0h | 0.0h | 🆕 New |");
    await services.goals.logTime("g1", 1);
    await services.tracking.generateWeeklyReport();
    expect(store.files.get(path)).toContain("| Paper | 3.0h | 0.0h | 🆕 New |");
  });
});
