import { daysUntil, isIsoDate, normalizeVaultPath, isSafeVaultPath } from "@orbitkit/shared";
import { MAX_ESTIMATED_HOURS, MAX_HOURS_PER_LOG } from "./constants";
import { GOAL_STATUSES, PRIORITIES, type Goal, type GoalStatus, type Milestone, type Priority } from "./types";

export type Urgency = "completed" | "overdue" | "critical" | "high" | "medium" | "low";

const PRIORITY_SCORE: Record<Priority, number> = { critical: 100, high: 50, medium: 20, low: 5 };

export function isCompleted(goal: Goal): boolean {
  return goal.status === "completed";
}

/** Days until the deadline; invalid deadlines count as far away. */
function daysLeft(goal: Goal, today: Date): number {
  return daysUntil(goal.deadline, today) ?? Number.POSITIVE_INFINITY;
}

/** Higher is more urgent: priority plus how close (or overdue) the deadline is. */
export function urgencyScore(goal: Goal, today: Date): number {
  const days = daysLeft(goal, today);
  let score = PRIORITY_SCORE[goal.priority];
  if (days < 0) score += 200;
  else if (days <= 3) score += 100;
  else if (days <= 7) score += 50;
  else if (days <= 14) score += 20;
  return score;
}

export function urgencyOf(goal: Goal, today: Date): Urgency {
  if (isCompleted(goal)) return "completed";
  const days = daysLeft(goal, today);
  if (days < 0) return "overdue";
  if (days <= 3) return "critical";
  if (days <= 7) return "high";
  if (days <= 14) return "medium";
  return "low";
}

/** Active goals by urgency (ties: earlier deadline, then name); completed goals last. */
export function sortGoals(goals: readonly Goal[], today: Date): Goal[] {
  return [...goals].sort((a, b) => {
    const completed = Number(isCompleted(a)) - Number(isCompleted(b));
    if (completed !== 0) return completed;
    return (
      urgencyScore(b, today) - urgencyScore(a, today) ||
      a.deadline.localeCompare(b.deadline) ||
      a.name.localeCompare(b.name)
    );
  });
}

export function activeGoals(goals: readonly Goal[], today: Date): Goal[] {
  return sortGoals(goals, today).filter((goal) => !isCompleted(goal));
}

export function deadlineLabel(days: number | null): string {
  if (days === null) return "No deadline set";
  if (days < 0) return days === -1 ? "Deadline was yesterday" : `Deadline passed ${Math.abs(days)} days ago`;
  if (days === 0) return "Due today";
  if (days === 1) return "Due tomorrow";
  return `${days} days left`;
}

export function progressPercent(goal: Goal): number {
  if (goal.estimatedHours <= 0) return 0;
  return Math.min(100, Math.round((goal.hoursLogged / goal.estimatedHours) * 100));
}

/** At risk: explicitly marked, or due within a week with less than half the work done. */
export function isAtRisk(goal: Goal, today: Date): boolean {
  if (isCompleted(goal)) return false;
  if (goal.status === "at-risk") return true;
  return daysLeft(goal, today) <= 7 && progressPercent(goal) < 50;
}

/** Hours per day still needed to finish by the deadline (never negative). */
export function requiredHoursPerDay(goal: Goal, today: Date): number {
  const remaining = Math.max(0, goal.estimatedHours - goal.hoursLogged);
  const days = daysLeft(goal, today);
  return days > 0 && Number.isFinite(days) ? remaining / days : remaining;
}

/** Parses one milestone per line; a leading "[x]" marks it done. */
export function parseMilestones(text: string): Milestone[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const done = /^\[x\]/i.test(line);
      const content = line.replace(/^\[[ x]\]\s*/i, "").trim();
      return { text: content, done };
    })
    .filter((milestone) => milestone.text.length > 0);
}

export function formatMilestones(milestones: readonly Milestone[]): string {
  return milestones.map((milestone) => `${milestone.done ? "[x] " : ""}${milestone.text}`).join("\n");
}

/** Normalizes priority values from any version ("Critical", "HIGH", …). */
export function toPriority(value: unknown, fallback: Priority = "medium"): Priority {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  return (PRIORITIES as readonly string[]).includes(normalized) ? (normalized as Priority) : fallback;
}

/** Normalizes status values from any version ("Not started", "Completed", "completed", …). */
export function toGoalStatus(value: unknown, fallback: GoalStatus = "not-started"): GoalStatus {
  const normalized = typeof value === "string" ? value.trim().toLowerCase().replace(/[\s_]+/g, "-") : "";
  return (GOAL_STATUSES as readonly string[]).includes(normalized) ? (normalized as GoalStatus) : fallback;
}

export type LabbookPathResult = { ok: true; path: string | null } | { ok: false; error: string };

/** Validates a labbook folder or note path typed by the user. Empty input removes the labbook. */
export function parseLabbookPath(input: string): LabbookPathResult {
  if (input.trim() === "") return { ok: true, path: null };
  if (!isSafeVaultPath(input)) {
    return { ok: false, error: "Use a vault-relative path without '..' or hidden folders." };
  }
  return { ok: true, path: normalizeVaultPath(input) };
}

/** Validates hours typed into a log form. */
export function parseHours(input: string | number, { allowZero = false } = {}): number | null {
  const hours = typeof input === "number" ? input : Number(input.trim());
  if (!Number.isFinite(hours) || hours > MAX_HOURS_PER_LOG) return null;
  if (allowZero ? hours < 0 : hours <= 0) return null;
  return Math.round(hours * 100) / 100;
}

export interface GoalInput {
  name: string;
  deadline: string;
  priority: string;
  estimatedHours: string;
  status: string;
  labbookPath: string;
  milestones: string;
}

export type GoalValidation = { ok: true; goal: Goal } | { ok: false; error: string };

/** Validates the goal form and merges it into the existing goal (or a new one with `id`). */
export function buildGoalFromInput(input: GoalInput, base: Goal | null, id: string): GoalValidation {
  const name = input.name.trim();
  if (!name) return { ok: false, error: "Give the goal a name." };
  if (!isIsoDate(input.deadline)) return { ok: false, error: "Pick a valid deadline." };
  const estimatedHours = Number(input.estimatedHours);
  if (!Number.isFinite(estimatedHours) || estimatedHours <= 0 || estimatedHours > MAX_ESTIMATED_HOURS) {
    return { ok: false, error: `Please enter an estimate between 0 and ${MAX_ESTIMATED_HOURS} hours.` };
  }
  const labbook = parseLabbookPath(input.labbookPath);
  if (!labbook.ok) return { ok: false, error: labbook.error };

  const goal: Goal = {
    id: base?.id ?? id,
    name,
    deadline: input.deadline,
    priority: toPriority(input.priority),
    estimatedHours,
    hoursLogged: base?.hoursLogged ?? 0,
    status: toGoalStatus(input.status),
    milestones: parseMilestones(input.milestones),
  };
  if (labbook.path) goal.labbookPath = labbook.path;
  return { ok: true, goal };
}
