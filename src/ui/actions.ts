import { pickRandom, VIEW_TYPES } from "@orbitkit/shared";
import { confirmAction, openNote, revealView } from "@orbitkit/shared/obsidian";
import { Notice, type App } from "obsidian";
import { MAX_SESSION_MINUTES } from "../domain/constants";
import { formatDurationWords, needsCheckIn } from "../domain/session";
import type { Goal } from "../domain/types";
import type { CompletedSession, Services } from "../services";
import {
  CheckInModal,
  DatePickerModal,
  GoalModal,
  JournalModal,
  LabbookModal,
  LabbookNoteModal,
  LogTimeModal,
  ProgressModal,
  ReflectionModal,
  StartSessionModal,
  WeeklyLogModal,
  WeeklyReviewModal,
} from "./modals";

/** Everything the commands, the view and the modals can do. Keeps UI code out of the Plugin class. */
export class Actions {
  constructor(
    readonly app: App,
    readonly services: Services,
  ) {}

  randomPrompt(): string {
    return pickRandom(this.services.state.settings.journalPrompts) ?? "";
  }

  async revealPanel(): Promise<void> {
    await revealView(this.app, VIEW_TYPES.mindfulFocus);
  }

  async openNote(path: string): Promise<void> {
    await openNote(this.app, path);
  }

  // ── Sessions ──────────────────────────────────────────────────────────────

  openStartSession(): void {
    if (this.services.sessions.active) {
      new Notice("A focus session is already running.");
      return;
    }
    new StartSessionModal(this).open();
  }

  async endSession(): Promise<void> {
    const session = this.services.sessions.active;
    if (!session) {
      new Notice("There's no focus session running right now.");
      return;
    }
    // A session that stayed open far past its plan was probably left running:
    // ask kindly how much to record instead of guessing.
    if (needsCheckIn(session, new Date(), MAX_SESSION_MINUTES)) {
      new CheckInModal(this, session, async (minutes) => {
        const completed = await this.services.sessions.end({ recordMinutes: minutes });
        if (!completed) return;
        new Notice(
          completed.minutes > 0
            ? `🌿 Session closed: ${formatDurationWords(completed.minutes)} recorded. Thanks for checking in.`
            : "🌿 Session closed. Thanks for checking in.",
        );
      }).open();
      return;
    }
    const completed = await this.services.sessions.end();
    if (!completed) return;
    new Notice(
      completed.capped
        ? `🌿 Session closed: ${formatDurationWords(completed.minutes)} recorded, the most one session can hold. You can add more with "Log time" if you like.`
        : `✅ Session complete: ${formatDurationWords(completed.minutes)}.`,
    );
    this.openReflection(completed);
  }

  openReflection(completed: CompletedSession): void {
    new ReflectionModal(this, completed).open();
  }

  // ── Goals ─────────────────────────────────────────────────────────────────

  openGoalModal(goal?: Goal): void {
    new GoalModal(this, goal ?? null).open();
  }

  openLogTime(goal: Goal): void {
    new LogTimeModal(this, goal).open();
  }

  openLabbookSetup(goal: Goal): void {
    new LabbookModal(this, goal).open();
  }

  openLabbookNote(goal: Goal): void {
    new LabbookNoteModal(this, goal).open();
  }

  async openLabbook(goal: Goal): Promise<void> {
    const { path } = await this.services.notes.ensureLabbook(goal);
    await this.openNote(path);
  }

  async completeGoal(goal: Goal): Promise<void> {
    await this.services.goals.complete(goal.id);
    new Notice(`🎉 Goal completed: ${goal.name}`);
  }

  async deleteGoal(goal: Goal): Promise<void> {
    const confirmed = await confirmAction(this.app, {
      title: "Delete goal?",
      message: `"${goal.name}" will be removed from Mindful Focus. Its labbook notes and logged time stay in your vault.`,
    });
    if (!confirmed) return;
    await this.services.goals.remove(goal.id);
    new Notice("Goal deleted.");
  }

  openWeeklyReview(): void {
    new WeeklyReviewModal(this).open();
  }

  // ── Logging ───────────────────────────────────────────────────────────────

  openJournal(): void {
    new JournalModal(this).open();
  }

  openProgress(): void {
    new ProgressModal(this).open();
  }

  openWeeklyLog(): void {
    new WeeklyLogModal(this).open();
  }

  // ── Notes ─────────────────────────────────────────────────────────────────

  async openDailyNote(date: Date): Promise<void> {
    const { path, created } = await this.services.notes.ensureDailyNote(date);
    await this.openNote(path);
    if (created) new Notice("📝 Daily note created.");
  }

  openFutureDayPicker(): void {
    new DatePickerModal(this, {
      title: "📅 Plan a future day",
      description: "Create (or open) the daily note for a day ahead.",
      submitText: "Open note",
      defaultOffsetDays: 1,
      minToday: true,
      quickPicks: [
        { label: "Tomorrow", days: 1 },
        { label: "In 2 days", days: 2 },
        { label: "In 3 days", days: 3 },
        { label: "Next week", days: 7 },
      ],
      onSubmit: (date) => this.openDailyNote(date),
    }).open();
  }

  async openWeeklyPlan(date: Date): Promise<void> {
    const { path, created } = await this.services.notes.ensureWeeklyPlan(date);
    await this.openNote(path);
    if (created) new Notice("📋 Weekly plan created.");
  }

  openWeeklyPlanPicker(): void {
    new DatePickerModal(this, {
      title: "📋 Plan a week",
      description: "Pick any day in the week to create (or open) its plan.",
      submitText: "Open plan",
      defaultOffsetDays: 0,
      minToday: false,
      quickPicks: [
        { label: "This week", days: 0 },
        { label: "Next week", days: 7 },
        { label: "In 2 weeks", days: 14 },
        { label: "In 3 weeks", days: 21 },
      ],
      onSubmit: (date) => this.openWeeklyPlan(date),
    }).open();
  }

  async generateWeeklyReport(): Promise<void> {
    const path = await this.services.tracking.generateWeeklyReport();
    await this.openNote(path);
    new Notice("✅ Weekly report generated.");
  }
}
