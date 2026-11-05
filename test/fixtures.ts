import { MemoryNoteStore, MemoryPersistence } from "@orbitkit/shared/testing";
import { createServices } from "../src/services";
import type { Goal } from "../src/domain/types";

/** Wednesday 4 November 2026, 10:30 local time (ISO week 2026-W45, Mon 2 – Sun 8 Nov). */
export const NOW = new Date(2026, 10, 4, 10, 30);

export function goal(overrides: Partial<Goal> = {}): Goal {
  return {
    id: "g1",
    name: "Paper",
    deadline: "2026-11-20",
    priority: "medium",
    estimatedHours: 10,
    hoursLogged: 0,
    status: "not-started",
    milestones: [],
    ...overrides,
  };
}

export class TestClock {
  constructor(public current: Date = new Date(NOW)) {}
  readonly now = (): Date => new Date(this.current);
  advanceMinutes(minutes: number): void {
    this.current = new Date(this.current.getTime() + minutes * 60_000);
  }
}

export async function setup(initialData?: unknown, files: Record<string, string> = {}) {
  const clock = new TestClock();
  const store = new MemoryNoteStore(files);
  const persistence = new MemoryPersistence(initialData);
  const services = await createServices(store, persistence, clock.now);
  return { clock, store, persistence, services };
}
