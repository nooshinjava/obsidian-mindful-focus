import { SaveQueue, type Persistence, type SchemaStatus } from "@orbitkit/shared";
import { pruneActivity } from "../domain/activity";
import { dataStatus, migrateSettings } from "../domain/migrate";
import type { MindfulFocusSettings } from "../domain/types";

export type Clock = () => Date;

/**
 * Owns the plugin's data. All changes go through `update`, which saves
 * (serialized through a SaveQueue) and then notifies subscribers such as the view.
 */
export class PluginState {
  private readonly listeners = new Set<() => void>();
  private readonly queue: SaveQueue;

  private constructor(
    private readonly data: MindfulFocusSettings,
    persistence: Persistence,
    private readonly now: Clock,
    /** How the stored data.json compared with this version when it was loaded. */
    readonly loadedStatus: SchemaStatus,
  ) {
    this.queue = new SaveQueue(persistence);
  }

  static async load(persistence: Persistence, now: Clock): Promise<PluginState> {
    const raw = await persistence.load();
    const status = dataStatus(raw);
    const state = new PluginState(migrateSettings(raw, now()), persistence, now, status);
    // Persist the migrated shape once so old v1 fields disappear from data.json.
    if (status === "outdated") await state.save();
    return state;
  }

  /** Current data. Treat as read-only; change it through `update`. */
  get settings(): MindfulFocusSettings {
    return this.data;
  }

  async update(mutate: (settings: MindfulFocusSettings) => void): Promise<void> {
    mutate(this.data);
    try {
      await this.save();
    } finally {
      this.emit();
    }
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private async save(): Promise<void> {
    this.data.activity = pruneActivity(this.data.activity, this.now());
    await this.queue.save(this.data);
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}
