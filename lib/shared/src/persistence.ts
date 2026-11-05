/** Where a plugin keeps its data.json (Plugin.loadData/saveData in Obsidian). */
export interface Persistence {
  load(): Promise<unknown>;
  save(data: unknown): Promise<void>;
}

/** Serializes saves so concurrent writes never interleave or arrive out of order. */
export class SaveQueue {
  private pending: Promise<void> = Promise.resolve();

  constructor(private readonly persistence: Persistence) {}

  save(data: unknown): Promise<void> {
    const snapshot = JSON.parse(JSON.stringify(data)) as unknown;
    const next = this.pending.then(() => this.persistence.save(snapshot));
    // Keep the queue alive after a failure; the caller still sees the rejection.
    this.pending = next.catch(() => undefined);
    return next;
  }
}
