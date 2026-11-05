import {
  appendUnderHeading,
  ensureNote,
  fileNameOf,
  isoWeekId,
  joinVaultPath,
  parentFolder,
  serializeFrontmatter,
  startOfIsoWeek,
  stripMarkdownExtension,
  toSafeFileName,
  writeGeneratedNote,
  type NoteStore,
} from "@orbitkit/shared";
import { DAILY_LOG_HEADING, LABBOOK_LOG_HEADING, LABBOOK_NOTE_HEADING } from "../domain/constants";
import { dailyNotePath, labbookFolderPath, labbookNotePath, weeklyPlanPath } from "../domain/paths";
import { dailyNoteTemplate, labbookNoteTemplate, labbookTemplate, weeklyPlanTemplate } from "../domain/templates";
import type { Goal } from "../domain/types";
import { SerialRunner } from "./serial";
import type { Clock, PluginState } from "./state";

/** Frontmatter marker of generated weekly reports. */
export const REPORT_MARKER = "mindful-focus-report";

export interface NoteResult {
  path: string;
  created: boolean;
}

/**
 * Every note the plugin creates or appends to: daily notes, weekly plans and
 * project labbooks. Writes are serialized and never overwrite existing notes.
 */
export class NoteService {
  private readonly writes = new SerialRunner();

  constructor(
    private readonly store: NoteStore,
    private readonly state: PluginState,
    private readonly now: Clock,
  ) {}

  dailyNotePath(date: Date): string {
    return dailyNotePath(this.state.settings, date);
  }

  /** Creates the daily note for `date` from the template unless it already exists. */
  async ensureDailyNote(date: Date): Promise<NoteResult> {
    const path = this.dailyNotePath(date);
    return await this.writes.run(async () => ({ path, created: await ensureNote(this.store, path, dailyNoteTemplate(date)) }));
  }

  /** Adds an entry to the top of today's log, creating today's note if needed. */
  async logToDaily(block: string): Promise<void> {
    const today = this.now();
    const path = this.dailyNotePath(today);
    await this.writes.run(() =>
      appendUnderHeading(this.store, path, DAILY_LOG_HEADING, block, dailyNoteTemplate(today)),
    );
  }

  weeklyPlanPath(date: Date): string {
    return weeklyPlanPath(this.state.settings, isoWeekId(date));
  }

  /** Opens-or-creates the plan for the ISO week that contains `date`. */
  async ensureWeeklyPlan(date: Date): Promise<NoteResult> {
    const weekId = isoWeekId(date);
    const path = weeklyPlanPath(this.state.settings, weekId);
    return await this.writes.run(async () => ({
      path,
      created: await ensureNote(this.store, path, weeklyPlanTemplate(weekId, startOfIsoWeek(date))),
    }));
  }

  /** Creates the goal's labbook note if needed and returns its path. */
  async ensureLabbook(goal: Goal): Promise<NoteResult> {
    const path = labbookNotePath(goal.labbookPath);
    return await this.writes.run(async () => ({
      path,
      created: await ensureNote(this.store, path, labbookTemplate(goal.name, this.now())),
    }));
  }

  /** Adds an entry under the labbook's running notes. Does nothing for goals without a labbook. */
  async appendToLabbook(goal: Goal, block: string): Promise<void> {
    if (!goal.labbookPath) return;
    const path = labbookNotePath(goal.labbookPath);
    await this.writes.run(() =>
      appendUnderHeading(this.store, path, LABBOOK_LOG_HEADING, block, labbookTemplate(goal.name, this.now())),
    );
  }

  /**
   * Creates a note in the labbook folder. If a note with that title exists it
   * is kept, and the starter notes are added to it instead of overwriting it.
   */
  async createLabbookNote(goal: Goal, title: string, notes: string): Promise<NoteResult> {
    const folder = labbookFolderPath(goal.labbookPath);
    if (!folder) throw new Error("Set the labbook to a folder (not a note at the vault root) to add notes.");
    const now = this.now();
    const safeTitle = toSafeFileName(title, "Notes");
    const path = joinVaultPath(folder, `${safeTitle}.md`);
    return await this.writes.run(async () => {
      const created = await ensureNote(this.store, path, labbookNoteTemplate(safeTitle, goal.name, now, notes));
      if (!created && notes.trim()) {
        await appendUnderHeading(this.store, path, LABBOOK_NOTE_HEADING, notes, "");
      }
      return { path, created };
    });
  }

  /**
   * Writes a generated report. It only ever replaces an earlier report (marked
   * in its frontmatter); a note of the user's with the same name is kept and
   * the report is written next to it. Returns the path actually used.
   */
  async writeGenerated(path: string, content: string): Promise<string> {
    const marked = `${serializeFrontmatter({ [REPORT_MARKER]: true })}\n${content}`;
    return await this.writes.run(() =>
      writeGeneratedNote(this.store, parentFolder(path), stripMarkdownExtension(fileNameOf(path)), marked, REPORT_MARKER),
    );
  }
}
