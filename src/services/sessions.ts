import { createId, formatIsoDate } from "@orbitkit/shared";
import { MAX_SESSION_MINUTES, MIN_SESSION_MINUTES } from "../domain/constants";
import { clampRecordedMinutes, elapsedMinutes } from "../domain/session";
import {
  labbookReflectionEntry,
  labbookTimeEntry,
  reflectionEntry,
  sessionCompletedEntry,
  sessionStartedEntry,
} from "../domain/templates";
import type { ActiveSession, Goal } from "../domain/types";
import { addHoursToGoal, type GoalService } from "./goals";
import type { NoteService } from "./notes";
import type { Clock, PluginState } from "./state";

export interface CompletedSession {
  focus: string;
  minutes: number;
  goalId?: string;
  goalName?: string;
  /** True when the session ran longer than the maximum and only the maximum was recorded. */
  capped?: boolean;
  /** True when the user chose how much time to record (after a session was left open). */
  checkedIn?: boolean;
}

export class SessionService {
  constructor(
    private readonly state: PluginState,
    private readonly notes: NoteService,
    private readonly goals: GoalService,
    private readonly now: Clock,
  ) {}

  get active(): ActiveSession | null {
    return this.state.settings.activeSession;
  }

  async start(focusInput: string, plannedMinutesInput: number, goalId?: string): Promise<ActiveSession> {
    if (this.active) throw new Error("a focus session is already running. End it whenever you're ready, then start the next one.");
    const focus = focusInput.trim();
    if (!focus) throw new Error("add a few words about what you'd like to focus on.");
    const plannedMinutes = Math.round(plannedMinutesInput);
    if (!Number.isFinite(plannedMinutes) || plannedMinutes < MIN_SESSION_MINUTES || plannedMinutes > MAX_SESSION_MINUTES) {
      throw new Error(`please choose a duration between ${MIN_SESSION_MINUTES} and ${MAX_SESSION_MINUTES} minutes.`);
    }
    const goal = this.goals.find(goalId);
    const now = this.now();
    const session: ActiveSession = { focus, plannedMinutes, startedAt: now.toISOString() };
    if (goal) session.goalId = goal.id;

    await this.state.update((settings) => {
      settings.activeSession = session;
    });
    await this.notes.logToDaily(sessionStartedEntry(focus, plannedMinutes, now, goal?.name));
    return session;
  }

  /**
   * Ends the running session and records its time straight away: one activity
   * entry, plus the hours on the linked goal. Returns null when nothing is running.
   *
   * `recordMinutes` is what the user chose to record after a session was left
   * open; without it, at most MAX_SESSION_MINUTES are recorded.
   */
  async end(options: { recordMinutes?: number } = {}): Promise<CompletedSession | null> {
    const session = this.active;
    if (!session) return null;
    const now = this.now();
    const elapsed = elapsedMinutes(session, now);
    const checkedIn = options.recordMinutes !== undefined;
    const minutes = checkedIn
      ? clampRecordedMinutes(options.recordMinutes ?? 0, elapsed)
      : Math.min(elapsed, MAX_SESSION_MINUTES);
    const hours = Math.round((minutes / 60) * 100) / 100;
    let goal = undefined as Goal | undefined;

    await this.state.update((settings) => {
      settings.activeSession = null;
      if (session.goalId && hours > 0) goal = addHoursToGoal(settings, session.goalId, hours);
      else goal = settings.goals.find((candidate) => candidate.id === session.goalId);
      if (hours > 0) {
        settings.activity.push({
          id: createId(now.getTime()),
          date: formatIsoDate(now),
          kind: "session",
          label: session.focus,
          hours,
          ...(goal ? { goalId: goal.id } : {}),
        });
      }
    });

    await this.notes.logToDaily(sessionCompletedEntry(session.focus, minutes, now, goal?.name));
    if (goal && hours > 0) await this.notes.appendToLabbook(goal, labbookTimeEntry(hours, now, session.focus, "Focus session"));

    return {
      focus: session.focus,
      minutes,
      ...(goal ? { goalId: goal.id, goalName: goal.name } : {}),
      ...(checkedIn ? { checkedIn: true } : elapsed > minutes ? { capped: true } : {}),
    };
  }

  /** Appends an optional reflection to today's note (and to the goal's labbook, if any). */
  async saveReflection(completed: CompletedSession, accomplished: string, nextAction: string): Promise<boolean> {
    if (!accomplished.trim() && !nextAction.trim()) return false;
    const now = this.now();
    await this.notes.logToDaily(reflectionEntry(accomplished, nextAction, now));
    const goal = this.goals.find(completed.goalId);
    if (goal) await this.notes.appendToLabbook(goal, labbookReflectionEntry(completed.focus, accomplished, nextAction, now));
    return true;
  }
}
