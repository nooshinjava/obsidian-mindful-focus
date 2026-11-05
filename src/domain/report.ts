import { daysUntil, escapeTableCell } from "@orbitkit/shared";
import { entriesInRange, formatItemName, isoWeekRange, previousWeekRange, type DateRange } from "./activity";
import { activeGoals, isAtRisk, progressPercent } from "./goals";
import type { ActivityEntry, Goal } from "./types";

export interface WeekSummary {
  range: DateRange;
  sessions: number;
  sessionHours: number;
  /** Hours per project/goal name: goal time, project progress and sessions linked to a goal. */
  projectHours: Record<string, number>;
  /** Hours per goal id (sessions linked to the goal and time logged to it). */
  goalHours: Record<string, number>;
  /** Hours per life-category item key. */
  categoryHours: Record<string, number>;
}

function add(map: Record<string, number>, key: string, hours: number): void {
  map[key] = (map[key] ?? 0) + hours;
}

/** Totals for one week. Each activity entry is counted exactly once per table. */
export function summarizeWeek(entries: readonly ActivityEntry[], goals: readonly Goal[], range: DateRange): WeekSummary {
  const goalNames = new Map(goals.map((goal) => [goal.id, goal.name]));
  const summary: WeekSummary = {
    range,
    sessions: 0,
    sessionHours: 0,
    projectHours: {},
    goalHours: {},
    categoryHours: {},
  };

  for (const entry of entriesInRange(entries, range)) {
    const goalName = entry.goalId ? (goalNames.get(entry.goalId) ?? entry.label) : undefined;
    switch (entry.kind) {
      case "session":
        summary.sessions += 1;
        summary.sessionHours += entry.hours;
        if (entry.goalId && goalName) {
          add(summary.goalHours, entry.goalId, entry.hours);
          add(summary.projectHours, goalName, entry.hours);
        }
        break;
      case "goal":
        if (entry.goalId) add(summary.goalHours, entry.goalId, entry.hours);
        add(summary.projectHours, goalName ?? entry.label, entry.hours);
        break;
      case "project":
        add(summary.projectHours, entry.label, entry.hours);
        break;
      case "category":
        if (entry.category) add(summary.categoryHours, entry.category, entry.hours);
        break;
    }
  }
  return summary;
}

export function makeProgressBar(percent: number, length = 10): string {
  const filled = Math.max(0, Math.min(length, Math.round((percent / 100) * length)));
  return "█".repeat(filled) + "░".repeat(length - filled);
}

function trend(current: number, previous: number, unit = ""): string {
  if (previous <= 0) return current > 0 ? "🆕 New" : "–";
  const diff = current - previous;
  const percent = Math.round((diff / previous) * 100);
  if (Math.abs(diff) < 0.05) return "➡️ No change";
  const sign = diff > 0 ? "↗ +" : "↘ ";
  return `${sign}${unit ? diff.toFixed(1) + unit : String(diff)} (${percent > 0 ? "+" : ""}${percent}%)`;
}

export interface WeeklyReportInput {
  goals: readonly Goal[];
  activity: readonly ActivityEntry[];
  categoryNames: Record<string, string>;
  today: Date;
  generatedAt: Date;
}

export interface WeeklyReport {
  weekStart: string;
  markdown: string;
}

/** Builds the weekly project report (ISO week, Monday–Sunday) from the structured activity log. */
export function buildWeeklyReport(input: WeeklyReportInput): WeeklyReport {
  const thisWeek = summarizeWeek(input.activity, input.goals, isoWeekRange(input.today));
  const lastWeek = summarizeWeek(input.activity, input.goals, previousWeekRange(input.today));
  const lines: string[] = [
    "# 📊 Weekly project report",
    "",
    `**Week:** ${thisWeek.range.start} to ${thisWeek.range.end}`,
    "",
    "## 📈 Summary",
    "",
    `- **Focus sessions:** ${thisWeek.sessions} (last week: ${lastWeek.sessions})`,
    `- **Focus hours:** ${thisWeek.sessionHours.toFixed(1)}h (last week: ${lastWeek.sessionHours.toFixed(1)}h)`,
    "",
    "## 🎯 Hours by project",
    "",
  ];

  const projects = Object.entries(thisWeek.projectHours).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  if (projects.length > 0) {
    lines.push("| Project | This week | Last week | Trend |", "| --- | ---: | ---: | --- |");
    for (const [project, hours] of projects) {
      const previous = lastWeek.projectHours[project] ?? 0;
      lines.push(
        `| ${escapeTableCell(project)} | ${hours.toFixed(1)}h | ${previous.toFixed(1)}h | ${trend(hours, previous, "h")} |`,
      );
    }
  } else {
    lines.push("*No project hours logged this week.*");
  }

  lines.push("", "## 🏁 Goal progress", "");
  const goals = activeGoals(input.goals, input.today);
  if (goals.length > 0) {
    lines.push("| Goal | Deadline | Progress | This week | Status |", "| --- | --- | --- | ---: | --- |");
    for (const goal of goals) {
      const percent = progressPercent(goal);
      const days = daysUntil(goal.deadline, input.today);
      let status = "🟢 On track";
      if (days !== null && days < 0) status = "🕰️ Past deadline";
      else if (isAtRisk(goal, input.today)) status = "🌱 Needs attention";
      else if (percent >= 100) status = "✅ Ready";
      const weekHours = thisWeek.goalHours[goal.id] ?? 0;
      lines.push(
        `| ${escapeTableCell(goal.name)} | ${goal.deadline} | ${makeProgressBar(percent)} ${percent}% | ${weekHours.toFixed(1)}h | ${status} |`,
      );
    }
  } else {
    lines.push("*No active goals.*");
  }

  const categories = Object.entries(thisWeek.categoryHours).sort((a, b) => b[1] - a[1]);
  if (categories.length > 0) {
    lines.push("", "## ⏱️ Time by category", "", "| Category | This week | Last week |", "| --- | ---: | ---: |");
    for (const [key, hours] of categories) {
      const previous = lastWeek.categoryHours[key] ?? 0;
      lines.push(
        `| ${escapeTableCell(formatItemName(key, input.categoryNames))} | ${hours.toFixed(1)}h | ${previous.toFixed(1)}h |`,
      );
    }
  }

  lines.push("", "## 💡 Insights", "");
  const insights: string[] = [];
  const top = projects[0];
  if (top) insights.push(`- **Top project:** ${top[0]} (${top[1].toFixed(1)}h)`);
  const atRisk = goals.filter((goal) => isAtRisk(goal, input.today));
  if (atRisk.length > 0) {
    insights.push(`- **🌱 Could use some attention:** ${atRisk.map((goal) => goal.name).join(", ")}`);
  }
  if (lastWeek.sessionHours > 0) {
    const change = Math.round(((thisWeek.sessionHours - lastWeek.sessionHours) / lastWeek.sessionHours) * 100);
    if (change > 10) insights.push(`- **🚀 Strong week:** focus time is up ${change}% on last week.`);
    else if (change < -10) {
      insights.push(`- **🌙 Quieter week:** ${Math.abs(change)}% less focus time than last week. Rest is part of the work, too.`);
    }
  }
  lines.push(...(insights.length > 0 ? insights : ["*Nothing to highlight this week.*"]));

  lines.push(
    "",
    "---",
    "",
    `*Generated by Mindful Focus on ${input.generatedAt.toLocaleString()}. Generating the report again replaces this note.*`,
    "",
  );
  return { weekStart: thisWeek.range.start, markdown: lines.join("\n") };
}
