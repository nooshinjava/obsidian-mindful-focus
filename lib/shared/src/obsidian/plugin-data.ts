import { normalizePath, Notice, type Plugin } from "obsidian";
import { isRecord, schemaStatus, type SchemaStatus } from "../data";
import type { Persistence } from "../persistence";

/**
 * The plugin's data.json, with two safety nets:
 *
 * - Before data from an older version is migrated for the first time, the
 *   original is copied to `data.backup-v<N>.json` next to it (once).
 * - Data written by a *newer* plugin version is never overwritten: saves are
 *   refused until the plugin is updated, so a device running an old version
 *   in a synced vault can't downgrade it.
 */
export class PluginDataStore implements Persistence {
  private status: SchemaStatus = "current";

  constructor(
    private readonly plugin: Plugin,
    private readonly schemaVersion: number,
    private readonly pluginName: string,
  ) {}

  get loadedStatus(): SchemaStatus {
    return this.status;
  }

  get readOnly(): boolean {
    return this.status === "newer";
  }

  async load(): Promise<unknown> {
    const raw: unknown = await this.plugin.loadData();
    this.status = schemaStatus(raw, this.schemaVersion);
    if (this.status === "outdated" && raw !== null && raw !== undefined) await this.backup(raw);
    if (this.status === "newer") {
      new Notice(
        `${this.pluginName}: your data was saved by a newer version of this plugin, so changes won't be saved until you update it.`,
        0,
      );
    }
    return raw;
  }

  async save(data: unknown): Promise<void> {
    if (this.readOnly) {
      throw new Error(`${this.pluginName} is read-only until you update it (its data comes from a newer version).`);
    }
    await this.plugin.saveData(data);
  }

  private async backup(raw: unknown): Promise<void> {
    const dir = this.plugin.manifest.dir;
    if (!dir) return;
    const version = isRecord(raw) && typeof raw.schemaVersion === "number" ? raw.schemaVersion : 1;
    const path = normalizePath(`${dir}/data.backup-v${version}.json`);
    const adapter = this.plugin.app.vault.adapter;
    try {
      if (!(await adapter.exists(path))) await adapter.write(path, JSON.stringify(raw, null, 2));
    } catch (error) {
      console.warn(`[OrbitKit] Could not back up ${this.pluginName} data before migrating`, error);
    }
  }
}
