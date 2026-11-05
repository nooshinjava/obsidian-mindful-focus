import { createId, formatIsoDate } from "@orbitkit/shared";
import { MAX_HOURS_PER_LOG } from "../domain/constants";
import { parseHours, sortGoals } from "../domain/goals";
import { goalTimeEntry, labbookTimeEntry } from "../domain/templates";
import type { ActivityEntry, Goal, MindfulFocusSettings } from "../domain/types";
import type { NoteService } from "./notes";
import type { Clock, PluginState } from "./state";

/** Adds hours to a goal inside a state mutation, moving "not started" goals to "in progress". */
export function addHoursToGoal(settings: MindfulFocusSettings, goalId: string, hours: number): Goal | undefined {
  const goal = settings.goals.find((candidate) => candidate.id === goalId);
  if (!goal) return undefined;
  goal.hoursLogged = Math.round((goal.hoursLogged + hours) * 100) / 100;
  if (goal.status === "not-started") goal.status = "in-progress";
  return goal;
}

export function requireHours(input: string | number): number {
  const hours = parseHours(input);
  if (hours === null) throw new Error(`Enter hours between 0 and ${MAX_HOURS_PER_LOG}.`);
  return hours;
}

export class GoalService {
  constructor(
    private readonly state: PluginState,
    private readonly notes: NoteService,
    private readonly now: Clock,
  ) {}

  /** Goals by urgency, completed last. */
  sorted(): Goal[] {
    return sortGoals(this.state.settings.goals, this.now());
  }

  find(goalId: string | undefined): Goal | undefined {
    return goalId ? this.state.settings.goals.find((goal) => goal.id === goalId) : undefined;
  }

  /** Inserts or replaces a goal (matched by id). */
  async save(goal: Goal): Promise<void> {
    await this.state.update((settings) => {
      const index = settings.goals.findIndex((candidate) => candidate.id === goal.id);
      if (index >= 0) settings.goals[index] = goal;
      else settings.goals.push(goal);
    });
  }

  /** Removes the goal. Its labbook notes and logged activity are kept. */
  async remove(goalId: string): Promise<void> {
    await this.state.update((settings) => {
      settings.goals = settings.goals.filter((goal) => goal.id !== goalId);
    });
  }

  async complete(goalId: string): Promise<Goal | undefined> {
    let completed = undefined as Goal | undefined;
    await this.state.update((settings) => {
      completed = settings.goals.find((goal) => goal.id === goalId);
      if (completed) completed.status = "completed";
    });
    return completed;
  }

  async toggleMilestone(goalId: string, index: number): Promise<void> {
    await this.state.update((settings) => {
      const milestone = settings.goals.find((goal) => goal.id === goalId)?.milestones[index];
      if (milestone) milestone.done = !milestone.done;
    });
  }

  /** Logs hours to a goal: one activity entry, the goal total, the daily note and the labbook. */
  async logTime(goalId: string, hoursInput: string | number, notes = ""): Promise<Goal> {
    const hours = requireHours(hoursInput);
    const now = this.now();
    let goal = undefined as Goal | undefined;
    await this.state.update((settings) => {
      goal = addHoursToGoal(settings, goalId, hours);
      if (!goal) return;
      const entry: ActivityEntry = {
        id: createId(now.getTime()),
        date: formatIsoDate(now),
        kind: "goal",
        label: goal.name,
        hours,
        goalId,
      };
      settings.activity.push(entry);
    });
    if (!goal) throw new Error("That goal no longer exists.");
    await this.notes.logToDaily(goalTimeEntry(goal.name, hours, now, notes));
    await this.notes.appendToLabbook(goal, labbookTimeEntry(hours, now, notes));
    return goal;
  }
}
