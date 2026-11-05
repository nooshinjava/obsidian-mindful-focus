import { isSafeVaultPath, normalizeVaultPath } from "@orbitkit/shared";
import { handleAsync } from "@orbitkit/shared/obsidian";
import { PluginSettingTab, Setting, type App, type Plugin } from "obsidian";
import { DEFAULT_SETTINGS, MAX_SESSION_MINUTES, MIN_SESSION_MINUTES } from "../domain/constants";
import type { MindfulFocusSettings } from "../domain/types";
import type { PluginState } from "../services/state";

type FolderKey = "dailyFolderPath" | "weeklyFolderPath" | "labbookFolderPath";

export class MindfulFocusSettingTab extends PluginSettingTab {
  constructor(
    app: App,
    plugin: Plugin,
    private readonly state: PluginState,
  ) {
    super(app, plugin);
  }

  private save(mutate: (settings: MindfulFocusSettings) => void): void {
    handleAsync("Could not save settings", () => this.state.update(mutate))();
  }

  private folderSetting(name: string, desc: string, key: FolderKey): void {
    new Setting(this.containerEl)
      .setName(name)
      .setDesc(desc)
      .addText((text) =>
        text
          .setPlaceholder(DEFAULT_SETTINGS[key])
          .setValue(this.state.settings[key])
          .onChange((value) => {
            const valid = value.trim() === "" || isSafeVaultPath(value);
            text.inputEl.toggleClass("mindful-focus-invalid", !valid);
            text.inputEl.setAttr("aria-invalid", String(!valid));
            if (!valid) return;
            this.save((settings) => {
              settings[key] = normalizeVaultPath(value) || DEFAULT_SETTINGS[key];
            });
          }),
      );
  }

  override display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl).setName("Folders").setHeading();
    this.folderSetting("Daily notes", "One note per day, named YYYY-MM-DD.", "dailyFolderPath");
    this.folderSetting("Weekly plans and reports", "Weekly plans (YYYY-Www-Plan) and weekly reports.", "weeklyFolderPath");
    this.folderSetting("Labbooks", "Suggested parent folder for new goal labbooks.", "labbookFolderPath");

    new Setting(containerEl).setName("Focus sessions").setHeading();
    new Setting(containerEl)
      .setName("Default session length")
      .setDesc(`Minutes (${MIN_SESSION_MINUTES}–${MAX_SESSION_MINUTES}).`)
      .addText((text) => {
        text.inputEl.type = "number";
        text.inputEl.min = String(MIN_SESSION_MINUTES);
        text.inputEl.max = String(MAX_SESSION_MINUTES);
        text.setValue(String(this.state.settings.defaultSessionMinutes)).onChange((value) => {
          const minutes = Math.round(Number(value));
          const valid = Number.isFinite(minutes) && minutes >= MIN_SESSION_MINUTES && minutes <= MAX_SESSION_MINUTES;
          text.inputEl.toggleClass("mindful-focus-invalid", !valid);
          if (valid) this.save((settings) => (settings.defaultSessionMinutes = minutes));
        });
      });
    new Setting(containerEl)
      .setName("Show timer in the status bar")
      .addToggle((toggle) =>
        toggle
          .setValue(this.state.settings.showStatusBar)
          .onChange((value) => this.save((settings) => (settings.showStatusBar = value))),
      );

    new Setting(containerEl).setName("Journal").setHeading();
    new Setting(containerEl)
      .setName("Prompts")
      .setDesc("One prompt per line. Shown in the panel and when starting a session.")
      .addTextArea((area) => {
        area.inputEl.rows = 6;
        area.setValue(this.state.settings.journalPrompts.join("\n")).onChange((value) => {
          const prompts = value
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean);
          this.save((settings) => {
            settings.journalPrompts = prompts.length > 0 ? prompts : [...DEFAULT_SETTINGS.journalPrompts];
          });
        });
      });

    containerEl.createEl("p", {
      cls: "setting-item-description",
      text: "Weekly categories, targets and display names can be customised in this plugin's data.json (lifeCategories, weeklyTargets, categoryNames).",
    });
  }
}
