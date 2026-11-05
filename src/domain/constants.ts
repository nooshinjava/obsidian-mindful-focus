import type { GoalStatus, MindfulFocusSettings, Priority } from "./types";

export const SCHEMA_VERSION = 2;

/** Activity older than this is pruned on save so data.json stays small. */
export const ACTIVITY_RETENTION_DAYS = 400;

export const MAX_HOURS_PER_LOG = 24;
export const MIN_SESSION_MINUTES = 1;
export const MAX_SESSION_MINUTES = 600;
export const MAX_ESTIMATED_HOURS = 10_000;
export const MAX_WEEKLY_TARGET = 168;

/** Headings the plugin inserts entries under. Kept identical to v1 so existing notes keep working. */
export const DAILY_LOG_HEADING = "## 📝 Log";
export const LABBOOK_LOG_HEADING = "## Running Notes";
export const LABBOOK_NOTE_HEADING = "## Notes";
export const LABBOOK_FILE_NAME = "Labbook.md";

export const PRIORITY_LABELS: Record<Priority, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
};

export const STATUS_LABELS: Record<GoalStatus, string> = {
  "not-started": "Not started",
  "in-progress": "In progress",
  "at-risk": "Needs attention",
  completed: "Completed",
};

export const DEFAULT_CATEGORY_COLOR = "#8b5cf6";

export const DEFAULT_SETTINGS: MindfulFocusSettings = {
  schemaVersion: SCHEMA_VERSION,
  dailyFolderPath: "Mindful Focus/Daily",
  weeklyFolderPath: "Mindful Focus/Weekly",
  labbookFolderPath: "Mindful Focus/Labbooks",
  defaultSessionMinutes: 90,
  showStatusBar: true,
  journalPrompts: [
    "What is the one thing that matters most right now?",
    "Is anything feeling heavy? What would make it a little lighter?",
    "How am I feeling in this moment?",
    "What would make this session feel good?",
    "What did I just finish? What's a gentle next step?",
  ],
  lifeCategories: {
    work: { name: "💼 Work", color: "#8b5cf6", weeklyTarget: 30, items: ["deep-work", "writing", "admin"] },
    growth: { name: "🌱 Growth", color: "#10b981", weeklyTarget: 6, items: ["reading", "learning"] },
    life: { name: "🌿 Life", color: "#f59e0b", weeklyTarget: 8, items: ["exercise", "family-friends", "hobbies"] },
  },
  weeklyTargets: {
    "deep-work": 20,
    writing: 6,
    admin: 4,
    reading: 3,
    learning: 3,
    exercise: 4,
    "family-friends": 2,
    hobbies: 2,
  },
  categoryNames: {},
  goals: [],
  activity: [],
  activeSession: null,
};

/** The 1.x default prompts. Data that still has exactly these gets the gentler defaults above. */
export const LEGACY_DEFAULT_PROMPTS: readonly string[] = [
  "What is the ONE thing I must accomplish right now?",
  "What am I avoiding? Why?",
  "How am I feeling in this moment?",
  "What would make this session successful?",
  "What did I just complete? What's next?",
];
