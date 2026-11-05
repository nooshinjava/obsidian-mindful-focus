import { VIEW_TYPES } from "@orbitkit/shared";
import { handleAsync, ObsidianNoteStore, PluginDataStore } from "@orbitkit/shared/obsidian";
import { Plugin } from "obsidian";
import { SCHEMA_VERSION } from "./domain/constants";
import { parseLegacySession } from "./domain/migrate";
import { createServices, type Services } from "./services";
import { Actions } from "./ui/actions";
import { MindfulFocusSettingTab } from "./ui/settings-tab";
import { StatusBar } from "./ui/status-bar";
import { MindfulFocusView } from "./ui/view";

/** v1 kept the running session in this global key, shared by every vault on the device. */
const LEGACY_SESSION_KEY = "mindful-focus-session";

export default class MindfulFocusPlugin extends Plugin {
  private services!: Services;
  private actions!: Actions;

  override async onload(): Promise<void> {
    // Backs up v1 data before migrating it, and refuses to save over data from a newer version.
    const data = new PluginDataStore(this, SCHEMA_VERSION, "Mindful Focus");
    this.services = await createServices(new ObsidianNoteStore(this.app), data);
    if (!data.readOnly) await this.importLegacySession();
    this.actions = new Actions(this.app, this.services);
    const actions = this.actions;

    this.registerView(VIEW_TYPES.mindfulFocus, (leaf) => new MindfulFocusView(leaf, actions));
    const reveal = handleAsync("Could not open Mindful Focus", () => actions.revealPanel());
    this.addRibbonIcon("target", "Open Mindful Focus", reveal);

    const statusBar = new StatusBar(this, this.services.sessions, reveal);
    statusBar.setVisible(this.services.state.settings.showStatusBar);
    this.register(
      this.services.state.subscribe(() => statusBar.setVisible(this.services.state.settings.showStatusBar)),
    );
    this.registerInterval(window.setInterval(() => statusBar.tick(), 1000));

    this.registerCommands(actions);
    this.addSettingTab(new MindfulFocusSettingTab(this.app, this, this.services.state));
  }

  private registerCommands(actions: Actions): void {
    const command = (id: string, name: string, run: () => void) => this.addCommand({ id, name, callback: run });
    const asyncCommand = (id: string, name: string, failure: string, run: () => Promise<void>) =>
      command(id, name, handleAsync(failure, run));

    command("start-focus-session", "Start focus session", () => actions.openStartSession());
    asyncCommand("end-focus-session", "End focus session", "Could not end the session", () => actions.endSession());
    command("quick-journal", "Quick journal entry", () => actions.openJournal());
    command("log-progress", "Log progress", () => actions.openProgress());
    asyncCommand("open-mindful-view", "Open panel", "Could not open Mindful Focus", () => actions.revealPanel());
    asyncCommand("create-today-note", "Open today's note", "Could not open today's note", () =>
      actions.openDailyNote(new Date()),
    );
    command("plan-future-day", "Plan a future day", () => actions.openFutureDayPicker());
    command("plan-week", "Plan a week", () => actions.openWeeklyPlanPicker());
    command("log-weekly-time", "Log weekly time", () => actions.openWeeklyLog());
    command("add-goal", "Add goal", () => actions.openGoalModal());
    command("weekly-review", "Review goals", () => actions.openWeeklyReview());
    asyncCommand("generate-weekly-report", "Generate weekly report", "Could not generate the report", () =>
      actions.generateWeeklyReport(),
    );
  }

  /**
   * One-time migration: moves a session left in v1's global localStorage key
   * into this vault's data.json, then deletes the key. Not used for anything else.
   */
  private async importLegacySession(): Promise<void> {
    let raw: string | null = null;
    try {
      raw = window.localStorage.getItem(LEGACY_SESSION_KEY);
      if (raw !== null) window.localStorage.removeItem(LEGACY_SESSION_KEY);
    } catch {
      return; // Storage unavailable; nothing to migrate.
    }
    const session = parseLegacySession(raw, new Date());
    if (!session || this.services.state.settings.activeSession) return;
    await this.services.state.update((settings) => {
      settings.activeSession = session;
    });
  }
}
