import type { NoteStore, Persistence } from "@orbitkit/shared";
import { GoalService } from "./goals";
import { NoteService } from "./notes";
import { SessionService } from "./sessions";
import { PluginState, type Clock } from "./state";
import { TrackingService } from "./tracking";

export interface Services {
  state: PluginState;
  notes: NoteService;
  goals: GoalService;
  sessions: SessionService;
  tracking: TrackingService;
}

/** Wires the services together. `store` and `persistence` are Obsidian adapters in the app and fakes in tests. */
export async function createServices(
  store: NoteStore,
  persistence: Persistence,
  now: Clock = () => new Date(),
): Promise<Services> {
  const state = await PluginState.load(persistence, now);
  const notes = new NoteService(store, state, now);
  const goals = new GoalService(state, notes, now);
  const sessions = new SessionService(state, notes, goals, now);
  const tracking = new TrackingService(state, notes, goals, now);
  return { state, notes, goals, sessions, tracking };
}

export type { Clock } from "./state";
export type { CompletedSession } from "./sessions";
