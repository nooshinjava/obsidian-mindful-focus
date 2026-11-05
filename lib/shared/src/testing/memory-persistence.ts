import type { Persistence } from "../persistence";

/** Persistence that keeps the saved data in memory (round-tripped through JSON like data.json). */
export class MemoryPersistence implements Persistence {
  saves = 0;
  private stored: string | null;

  constructor(initial?: unknown) {
    this.stored = initial === undefined ? null : JSON.stringify(initial);
  }

  load(): Promise<unknown> {
    return Promise.resolve(this.stored === null ? null : (JSON.parse(this.stored) as unknown));
  }

  save(data: unknown): Promise<void> {
    this.saves += 1;
    this.stored = JSON.stringify(data);
    return Promise.resolve();
  }

  get data(): unknown {
    return this.stored === null ? null : (JSON.parse(this.stored) as unknown);
  }
}
