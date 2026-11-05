import { addDays, formatClockTime, formatIsoDate, formatLongDate, singleLine } from "@orbitkit/shared";
import { DAILY_LOG_HEADING, LABBOOK_LOG_HEADING, LABBOOK_NOTE_HEADING } from "./constants";

const PLAN_HOURS = ["08", "09", "10", "11", "12", "13", "14", "15", "16", "17"];
const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

/** Indents continuation lines so multi-line text stays inside its list item. */
export function listValue(text: string): string {
  return text
    .trim()
    .split(/\r?\n/)
    .map((line, index) => (index === 0 ? line : `  ${line}`))
    .join("\n");
}

export function dailyNoteTemplate(date: Date, formatTitle: (date: Date) => string = formatLongDate): string {
  return [
    `# ${formatTitle(date)}`,
    "",
    "## 🎯 Today",
    ...PLAN_HOURS.map((hour) => `- [ ] ${hour}:00 - `),
    "",
    "---",
    "",
    DAILY_LOG_HEADING,
    "",
  ].join("\n");
}

export function weeklyPlanTemplate(weekId: string, monday: Date): string {
  const sunday = addDays(monday, 6);
  const from = monday.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const to = sunday.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  const weekNumber = weekId.split("-W")[1] ?? weekId;
  return [
    `# Week ${weekNumber}: ${from} – ${to}`,
    "",
    "## 🎯 This week's goals",
    "1. ",
    "2. ",
    "3. ",
    "",
    "---",
    "",
    "## 📅 Plan",
    "",
    ...WEEKDAYS.flatMap((day) => [`### ${day}`, "- ", ""]),
    "---",
    "",
    "## 📝 Notes",
    "",
  ].join("\n");
}

export function labbookTemplate(goalName: string, date: Date): string {
  const today = formatIsoDate(date);
  const name = singleLine(goalName);
  return [
    `# ${name} labbook`,
    "",
    `Linked goal: ${name}`,
    `Created: ${today}`,
    "",
    "## Current status",
    "",
    "- ",
    "",
    LABBOOK_LOG_HEADING,
    "",
  ].join("\n");
}

export function labbookNoteTemplate(title: string, goalName: string, now: Date, notes: string): string {
  return [
    `# ${singleLine(title)}`,
    "",
    `Project: ${singleLine(goalName)}`,
    `Created: ${formatIsoDate(now)} ${formatClockTime(now)}`,
    "",
    LABBOOK_NOTE_HEADING,
    "",
    notes.trim() || "- ",
    "",
  ].join("\n");
}

// ── Log entries (inserted under the daily log / labbook headings) ────────────

export function sessionStartedEntry(focus: string, plannedMinutes: number, now: Date, goalName?: string): string {
  return [
    `### 🎯 Focus session started (${formatClockTime(now)})`,
    `- **Focus:** ${listValue(focus)}`,
    `- **Planned duration:** ${plannedMinutes} minutes`,
    ...(goalName ? [`- **Goal:** ${singleLine(goalName)}`] : []),
  ].join("\n");
}

export function sessionCompletedEntry(focus: string, minutes: number, now: Date, goalName?: string): string {
  return [
    minutes > 0
      ? `### ✅ Focus session completed (${formatClockTime(now)})`
      : `### 🌿 Focus session closed (${formatClockTime(now)})`,
    `- **Focus:** ${listValue(focus)}`,
    minutes > 0 ? `- **Duration:** ${minutes} minutes` : "- **Duration:** no time recorded",
    ...(goalName ? [`- **Goal:** ${singleLine(goalName)}`] : []),
  ].join("\n");
}

export function reflectionEntry(accomplished: string, nextAction: string, now: Date): string {
  return [
    `### 🪞 Session reflection (${formatClockTime(now)})`,
    ...(accomplished.trim() ? [`- **Worked on:** ${listValue(accomplished)}`] : []),
    ...(nextAction.trim() ? [`- **Next step:** ${listValue(nextAction)}`] : []),
  ].join("\n");
}

export function journalEntry(text: string, now: Date): string {
  return `### 💭 Journal entry (${formatClockTime(now)})\n${text.trim()}`;
}

export function goalTimeEntry(goalName: string, hours: number, now: Date, notes: string): string {
  return [
    `### ⏱️ Time logged: ${singleLine(goalName)} (${formatClockTime(now)})`,
    `- **Hours:** ${hours.toFixed(2)}h`,
    ...(notes.trim() ? [`- **Notes:** ${listValue(notes)}`] : []),
  ].join("\n");
}

export function progressEntry(project: string, hours: number, now: Date, what: string): string {
  return [
    `### 📊 ${singleLine(project)} (${formatClockTime(now)})`,
    `- **Hours:** ${hours.toFixed(2)}h`,
    `- **What I did:** ${listValue(what)}`,
  ].join("\n");
}

export function categoryTimeEntry(itemName: string, hours: number, now: Date, notes: string): string {
  return [
    `### ⏱️ ${singleLine(itemName)} (${formatClockTime(now)})`,
    `- **Hours:** ${hours.toFixed(2)}h`,
    ...(notes.trim() ? [`- **Notes:** ${listValue(notes)}`] : []),
  ].join("\n");
}

export function labbookTimeEntry(hours: number, now: Date, notes: string, source = "Time logged"): string {
  return [
    `### ${formatIsoDate(now)} ${formatClockTime(now)}`,
    `- **${source}:** ${hours.toFixed(2)}h`,
    ...(notes.trim() ? [`- **Notes:** ${listValue(notes)}`] : []),
  ].join("\n");
}

export function labbookReflectionEntry(focus: string, accomplished: string, nextAction: string, now: Date): string {
  return [
    `### ${formatIsoDate(now)} ${formatClockTime(now)} — session reflection`,
    `- **Focus:** ${listValue(focus)}`,
    ...(accomplished.trim() ? [`- **Worked on:** ${listValue(accomplished)}`] : []),
    ...(nextAction.trim() ? [`- **Next step:** ${listValue(nextAction)}`] : []),
  ].join("\n");
}
