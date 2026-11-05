import { createId, formatIsoDate } from "@orbitkit/shared";
import { categoryHoursForWeek, formatItemName } from "../domain/activity";
import { MAX_HOURS_PER_LOG } from "../domain/constants";
import { parseHours } from "../domain/goals";
import { buildWeeklyReport } from "../domain/report";
import { weeklyReportPath } from "../domain/paths";
import { categoryTimeEntry, journalEntry, progressEntry } from "../domain/templates";
import { requireHours, type GoalService } from "./goals";
import type { NoteService } from "./notes";
import type { Clock, PluginState } from "./state";

/** Journal, progress and weekly category logging, plus the weekly report. */
export class TrackingService {
  constructor(
    private readonly state: PluginState,
    private readonly notes: NoteService,
    private readonly goals: GoalService,
    private readonly now: Clock,
  ) {}

  async journal(text: string): Promise<void> {
    if (!text.trim()) throw new Error("Write something first.");
    await this.notes.logToDaily(journalEntry(text, this.now()));
  }

  /**
   * Logs progress on a project. With a goal it is recorded once as goal time;
   * without one it becomes a "project" entry. Zero hours only writes the note entry.
   */
  async logProgress(projectInput: string, hoursInput: string | number, whatInput: string, goalId?: string): Promise<void> {
    const project = projectInput.trim();
    const what = whatInput.trim();
    if (!project || !what) throw new Error("Fill in the project and what you did.");
    const hours = parseHours(hoursInput, { allowZero: true });
    if (hours === null) throw new Error(`Enter hours between 0 and ${MAX_HOURS_PER_LOG}.`);

    const goal = this.goals.find(goalId);
    if (goal && hours > 0) {
      await this.goals.logTime(goal.id, hours, what);
      return;
    }

    const now = this.now();
    if (hours > 0) {
      await this.state.update((settings) => {
        settings.activity.push({ id: createId(now.getTime()), date: formatIsoDate(now), kind: "project", label: project, hours });
      });
    }
    await this.notes.logToDaily(progressEntry(goal?.name ?? project, hours, now, what));
  }

  /** Logs time against a life-category item such as "reading". */
  async logCategoryTime(category: string, hoursInput: string | number, notes = ""): Promise<string> {
    const known = Object.values(this.state.settings.lifeCategories).some((group) => group.items.includes(category));
    if (!known) throw new Error("Choose a category.");
    const hours = requireHours(hoursInput);
    const now = this.now();
    await this.state.update((settings) => {
      settings.activity.push({
        id: createId(now.getTime()),
        date: formatIsoDate(now),
        kind: "category",
        label: category,
        category,
        hours,
      });
    });
    const name = formatItemName(category, this.state.settings.categoryNames);
    await this.notes.logToDaily(categoryTimeEntry(name, hours, now, notes));
    return name;
  }

  /** Hours per category item this ISO week. Pure read; never mutates state. */
  weeklyCategoryHours(): Record<string, number> {
    return categoryHoursForWeek(this.state.settings.activity, this.now());
  }

  /** Writes (or regenerates) this week's report in the weekly folder and returns its path. */
  async generateWeeklyReport(): Promise<string> {
    const now = this.now();
    const { weekStart, markdown } = buildWeeklyReport({
      goals: this.state.settings.goals,
      activity: this.state.settings.activity,
      categoryNames: this.state.settings.categoryNames,
      today: now,
      generatedAt: now,
    });
    return await this.notes.writeGenerated(weeklyReportPath(this.state.settings, weekStart), markdown);
  }
}
