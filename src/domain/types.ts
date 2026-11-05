export const PRIORITIES = ["critical", "high", "medium", "low"] as const;
export type Priority = (typeof PRIORITIES)[number];

export const GOAL_STATUSES = ["not-started", "in-progress", "at-risk", "completed"] as const;
export type GoalStatus = (typeof GOAL_STATUSES)[number];

export interface Milestone {
  text: string;
  done: boolean;
}

export interface Goal {
  id: string;
  name: string;
  /** Calendar date, "YYYY-MM-DD". */
  deadline: string;
  priority: Priority;
  estimatedHours: number;
  hoursLogged: number;
  status: GoalStatus;
  /** Vault-relative folder, or a note ending in ".md". */
  labbookPath?: string;
  milestones: Milestone[];
}

export const ACTIVITY_KINDS = ["session", "goal", "project", "category"] as const;
export type ActivityKind = (typeof ACTIVITY_KINDS)[number];

/**
 * One block of tracked time. The activity log is the single source of truth
 * for weekly totals and reports.
 */
export interface ActivityEntry {
  id: string;
  /** Calendar date, "YYYY-MM-DD". */
  date: string;
  kind: ActivityKind;
  /** Session focus, goal name (at the time), project name or category key. */
  label: string;
  hours: number;
  goalId?: string;
  /** Life-category item key for kind "category". */
  category?: string;
}

export interface ActiveSession {
  focus: string;
  plannedMinutes: number;
  /** ISO timestamp. */
  startedAt: string;
  goalId?: string;
}

export interface LifeCategory {
  name: string;
  /** "#rgb" or "#rrggbb". */
  color: string;
  weeklyTarget: number;
  /** Keys of the tracked items in this category, e.g. "deep-work". */
  items: string[];
}

export interface MindfulFocusSettings {
  schemaVersion: number;
  dailyFolderPath: string;
  weeklyFolderPath: string;
  labbookFolderPath: string;
  defaultSessionMinutes: number;
  showStatusBar: boolean;
  journalPrompts: string[];
  lifeCategories: Record<string, LifeCategory>;
  weeklyTargets: Record<string, number>;
  /** Optional display names for item keys, e.g. { "deep-work": "🧠 Deep work" }. */
  categoryNames: Record<string, string>;
  goals: Goal[];
  activity: ActivityEntry[];
  activeSession: ActiveSession | null;
}
