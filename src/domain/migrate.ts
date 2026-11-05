import {
  cloneJson,
  createId,
  formatIsoDate,
  isIsoDate,
  isRecord,
  isSafeVaultPath,
  normalizeVaultPath,
  readBoolean,
  readEnum,
  readIsoTimestamp,
  readNumber,
  readString,
  readStringArray,
  resolveFolderSetting,
  schemaStatus,
  type SchemaStatus,
} from "@orbitkit/shared";
import { pruneActivity } from "./activity";
import {
  DEFAULT_CATEGORY_COLOR,
  DEFAULT_SETTINGS,
  LEGACY_DEFAULT_PROMPTS,
  MAX_ESTIMATED_HOURS,
  MAX_HOURS_PER_LOG,
  MAX_SESSION_MINUTES,
  MAX_WEEKLY_TARGET,
  MIN_SESSION_MINUTES,
  SCHEMA_VERSION,
} from "./constants";
import { toGoalStatus, toPriority } from "./goals";
import {
  ACTIVITY_KINDS,
  type ActiveSession,
  type ActivityEntry,
  type Goal,
  type LifeCategory,
  type Milestone,
  type MindfulFocusSettings,
} from "./types";

const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

export function isHexColor(value: unknown): value is string {
  return typeof value === "string" && HEX_COLOR.test(value.trim());
}

/** Week id computed the way v1 did (Sunday-based, not ISO); only used to migrate v1 weekly totals. */
export function legacyWeekId(now: Date): string {
  const startOfYear = new Date(now.getFullYear(), 0, 1);
  const weekNumber = Math.ceil(
    ((now.getTime() - startOfYear.getTime()) / 86_400_000 + startOfYear.getDay() + 1) / 7,
  );
  return `${now.getFullYear()}-W${String(weekNumber).padStart(2, "0")}`;
}

function migrateMilestones(value: unknown): Milestone[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isRecord)
    .map((item) => ({ text: readString(item.text).trim(), done: readBoolean(item.done, false) }))
    .filter((milestone) => milestone.text.length > 0);
}

function migrateGoal(value: unknown, today: string, seenIds: Set<string>): Goal | null {
  if (!isRecord(value)) return null;
  const name = readString(value.name).trim();
  if (!name) return null;

  let id = readString(value.id).trim();
  if (!id || seenIds.has(id)) id = createId();
  seenIds.add(id);

  const estimated = readNumber(value.estimatedHours, 10, { max: MAX_ESTIMATED_HOURS });
  const goal: Goal = {
    id,
    name,
    deadline: isIsoDate(value.deadline) ? value.deadline.trim() : today,
    priority: toPriority(value.priority),
    estimatedHours: estimated > 0 ? estimated : 10,
    hoursLogged: readNumber(value.hoursLogged, 0, { min: 0, max: MAX_ESTIMATED_HOURS * 10 }),
    status: toGoalStatus(value.status),
    milestones: migrateMilestones(value.milestones),
  };
  const labbookPath = normalizeVaultPath(readString(value.labbookPath));
  if (labbookPath && isSafeVaultPath(labbookPath)) goal.labbookPath = labbookPath;
  return goal;
}

function migrateActivityEntry(value: unknown): ActivityEntry | null {
  if (!isRecord(value)) return null;
  const hours = readNumber(value.hours, 0, { min: 0, max: MAX_HOURS_PER_LOG });
  if (hours <= 0 || !isIsoDate(value.date)) return null;
  const kind = readEnum(value.kind, ACTIVITY_KINDS, "project");
  const entry: ActivityEntry = {
    id: readString(value.id) || createId(),
    date: value.date.trim(),
    kind,
    label: readString(value.label).trim() || "Untitled",
    hours,
  };
  const goalId = readString(value.goalId).trim();
  if (goalId) entry.goalId = goalId;
  const category = readString(value.category).trim();
  if (category) entry.category = category;
  if (kind === "category" && !entry.category) return null;
  return entry;
}

function migrateSession(value: unknown, now: Date): ActiveSession | null {
  if (!isRecord(value)) return null;
  const focus = readString(value.focus).trim();
  const startedAt = readIsoTimestamp(value.startedAt, "");
  if (!focus || !startedAt || new Date(startedAt).getTime() > now.getTime() + 60_000) return null;
  const session: ActiveSession = {
    focus,
    plannedMinutes: Math.round(
      readNumber(value.plannedMinutes, DEFAULT_SETTINGS.defaultSessionMinutes, {
        min: MIN_SESSION_MINUTES,
        max: MAX_SESSION_MINUTES,
      }),
    ),
    startedAt,
  };
  const goalId = readString(value.goalId).trim();
  if (goalId) session.goalId = goalId;
  return session;
}

/**
 * Reads the session v1 kept in the global `mindful-focus-session` localStorage
 * key: `{ session: { focus, duration }, startTime, goal: { id, … } | null }`.
 */
export function parseLegacySession(json: string | null, now: Date): ActiveSession | null {
  if (!json) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }
  if (!isRecord(parsed) || !isRecord(parsed.session)) return null;
  return migrateSession(
    {
      focus: parsed.session.focus,
      plannedMinutes: parsed.session.duration,
      startedAt: parsed.startTime,
      goalId: isRecord(parsed.goal) ? parsed.goal.id : undefined,
    },
    now,
  );
}

function migrateCategories(value: unknown): Record<string, LifeCategory> {
  if (!isRecord(value)) return cloneJson(DEFAULT_SETTINGS.lifeCategories);
  const categories: Record<string, LifeCategory> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (!isRecord(raw)) continue;
    const items = readStringArray(raw.items)
      .map((item) => item.trim())
      .filter(Boolean);
    categories[key] = {
      name: readString(raw.name).trim() || key,
      color: isHexColor(raw.color) ? raw.color.trim() : DEFAULT_CATEGORY_COLOR,
      weeklyTarget: readNumber(raw.weeklyTarget, 0, { min: 0, max: MAX_WEEKLY_TARGET }),
      items: [...new Set(items)],
    };
  }
  return Object.keys(categories).length > 0 ? categories : cloneJson(DEFAULT_SETTINGS.lifeCategories);
}

function migrateNumberMap(value: unknown, fallback: Record<string, number>): Record<string, number> {
  if (!isRecord(value)) return cloneJson(fallback);
  const result: Record<string, number> = {};
  for (const [key, raw] of Object.entries(value)) {
    const number = readNumber(raw, Number.NaN, { min: 0, max: MAX_WEEKLY_TARGET });
    if (!Number.isNaN(number)) result[key] = number;
  }
  return result;
}

function migrateStringMap(value: unknown): Record<string, string> {
  if (!isRecord(value)) return {};
  const result: Record<string, string> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (typeof raw === "string" && raw.trim()) result[key] = raw.trim();
  }
  return result;
}

/** v1 kept only the current week's totals: `{ currentWeek, logged: { item: hours } }`. */
function migrateLegacyWeeklyTotals(value: unknown, now: Date): ActivityEntry[] {
  if (!isRecord(value) || value.currentWeek !== legacyWeekId(now) || !isRecord(value.logged)) return [];
  const today = formatIsoDate(now);
  const entries: ActivityEntry[] = [];
  for (const [item, raw] of Object.entries(value.logged)) {
    const hours = readNumber(raw, 0, { min: 0, max: MAX_WEEKLY_TARGET });
    if (hours > 0) entries.push({ id: createId(), date: today, kind: "category", label: item, category: item, hours });
  }
  return entries;
}

/** "outdated" data is migrated and saved; "newer" data came from a newer plugin version. */
export function dataStatus(raw: unknown): SchemaStatus {
  return schemaStatus(raw, SCHEMA_VERSION);
}

/**
 * Turns whatever is in data.json (v1, v2, hand-edited or corrupt) into valid
 * v2 settings. Never throws; unknown fields are dropped.
 */
export function migrateSettings(raw: unknown, now: Date): MindfulFocusSettings {
  const defaults = cloneJson(DEFAULT_SETTINGS);
  if (!isRecord(raw)) return defaults;

  const isLegacy = readNumber(raw.schemaVersion, 1) < SCHEMA_VERSION;
  const today = formatIsoDate(now);
  const seenIds = new Set<string>();
  const goals = Array.isArray(raw.goals)
    ? raw.goals.map((goal) => migrateGoal(goal, today, seenIds)).filter((goal): goal is Goal => goal !== null)
    : [];

  const activity = Array.isArray(raw.activity)
    ? raw.activity.map(migrateActivityEntry).filter((entry): entry is ActivityEntry => entry !== null)
    : [];
  if (isLegacy) activity.push(...migrateLegacyWeeklyTotals(raw.weeklyTracking, now));

  const prompts = readStringArray(raw.journalPrompts)
    .map((prompt) => prompt.trim())
    .filter(Boolean);

  return {
    schemaVersion: SCHEMA_VERSION,
    dailyFolderPath: resolveFolderSetting(
      readString(raw.dailyFolderPath ?? raw.liveFolderPath),
      defaults.dailyFolderPath,
    ),
    weeklyFolderPath: resolveFolderSetting(readString(raw.weeklyFolderPath), defaults.weeklyFolderPath),
    labbookFolderPath: resolveFolderSetting(readString(raw.labbookFolderPath), defaults.labbookFolderPath),
    defaultSessionMinutes: Math.round(
      readNumber(raw.defaultSessionMinutes ?? raw.defaultSessionDuration, defaults.defaultSessionMinutes, {
        min: MIN_SESSION_MINUTES,
        max: MAX_SESSION_MINUTES,
      }),
    ),
    showStatusBar: readBoolean(raw.showStatusBar ?? raw.enableStatusBar, defaults.showStatusBar),
    journalPrompts:
      prompts.length > 0 && prompts.join("\n") !== LEGACY_DEFAULT_PROMPTS.join("\n") ? prompts : [...defaults.journalPrompts],
    lifeCategories: migrateCategories(raw.lifeCategories),
    weeklyTargets: migrateNumberMap(raw.weeklyTargets, defaults.weeklyTargets),
    categoryNames: migrateStringMap(raw.categoryNames),
    goals,
    activity: pruneActivity(activity, now),
    activeSession: migrateSession(raw.activeSession, now),
  };
}
