import { isSafeVaultPath, normalizeVaultPath } from "@orbitkit/shared";
import { handleAsync } from "@orbitkit/shared/obsidian";
import { PluginSettingTab, Setting, type App, type Plugin, type SettingDefinitionItem } from "obsidian";
import { DEFAULT_SETTINGS, MAX_SESSION_MINUTES, MIN_SESSION_MINUTES } from "../domain/constants";
import type { MindfulFocusSettings } from "../domain/types";
import type { PluginState } from "../services/state";

type FolderKey = "dailyFolderPath" | "weeklyFolderPath" | "labbookFolderPath";

const FOLDERS: ReadonlyArray<{ key: FolderKey; name: string; desc: string }> = [
  { key: "dailyFolderPath", name: "Daily notes", desc: "One note per day, named YYYY-MM-DD." },
  { key: "weeklyFolderPath", name: "Weekly plans and reports", desc: "Weekly plans (YYYY-Www-Plan) and weekly reports." },
  { key: "labbookFolderPath", name: "Labbooks", desc: "Suggested parent folder for new goal labbooks." },
];
const SESSION_NAME = "Default session length";
const SESSION_DESC = `Minutes (${MIN_SESSION_MINUTES}–${MAX_SESSION_MINUTES}).`;
const STATUS_BAR_NAME = "Show timer in the status bar";
const PROMPTS_NAME = "Prompts";
const PROMPTS_DESC = "One prompt per line. Shown in the panel and when starting a session.";
const CATEGORIES_NAME = "Weekly categories";
const CATEGORIES_DESC =
  "Weekly categories, targets and display names can be customised in this plugin's data.json (lifeCategories, weeklyTargets, categoryNames).";

function folderProblem(value: string): string | undefined {
  return value.trim() === "" || isSafeVaultPath(value)
    ? undefined
    : "Please choose a folder inside this vault (no \"..\" and no hidden folders).";
}

function minutesProblem(value: number): string | undefined {
  const minutes = Math.round(value);
  return Number.isFinite(minutes) && minutes >= MIN_SESSION_MINUTES && minutes <= MAX_SESSION_MINUTES
    ? undefined
    : `Please choose between ${MIN_SESSION_MINUTES} and ${MAX_SESSION_MINUTES} minutes.`;
}

function parsePrompts(value: string): string[] {
  const prompts = value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  return prompts.length > 0 ? prompts : [...DEFAULT_SETTINGS.journalPrompts];
}

export class MindfulFocusSettingTab extends PluginSettingTab {
  constructor(
    app: App,
    plugin: Plugin,
    private readonly state: PluginState,
  ) {
    super(app, plugin);
  }

  /** Obsidian 1.13+ renders these and includes them in settings search. */
  override getSettingDefinitions(): SettingDefinitionItem[] {
    return [
      {
        type: "group",
        heading: "Folders",
        items: FOLDERS.map(({ key, name, desc }) => ({
          name,
          desc,
          control: { type: "folder" as const, key, placeholder: DEFAULT_SETTINGS[key], validate: folderProblem },
        })),
      },
      {
        type: "group",
        heading: "Focus sessions",
        items: [
          {
            name: SESSION_NAME,
            desc: SESSION_DESC,
            control: {
              type: "number",
              key: "defaultSessionMinutes",
              min: MIN_SESSION_MINUTES,
              max: MAX_SESSION_MINUTES,
              step: 1,
              validate: minutesProblem,
            },
          },
          { name: STATUS_BAR_NAME, control: { type: "toggle", key: "showStatusBar" } },
        ],
      },
      {
        type: "group",
        heading: "Journal",
        items: [{ name: PROMPTS_NAME, desc: PROMPTS_DESC, control: { type: "textarea", key: "journalPrompts", rows: 6 } }],
      },
      { name: CATEGORIES_NAME, desc: CATEGORIES_DESC },
    ];
  }

  override getControlValue(key: string): unknown {
    const { settings } = this.state;
    if (FOLDERS.some((folder) => folder.key === key)) return settings[key as FolderKey];
    if (key === "defaultSessionMinutes") return settings.defaultSessionMinutes;
    if (key === "showStatusBar") return settings.showStatusBar;
    if (key === "journalPrompts") return settings.journalPrompts.join("\n");
    return undefined;
  }

  override async setControlValue(key: string, value: unknown): Promise<void> {
    const folder = FOLDERS.find((candidate) => candidate.key === key);
    if (folder && typeof value === "string") {
      await this.state.update((settings) => {
        settings[folder.key] = normalizeVaultPath(value) || DEFAULT_SETTINGS[folder.key];
      });
    } else if (key === "defaultSessionMinutes" && typeof value === "number" && !minutesProblem(value)) {
      await this.state.update((settings) => (settings.defaultSessionMinutes = Math.round(value)));
    } else if (key === "showStatusBar" && typeof value === "boolean") {
      await this.state.update((settings) => (settings.showStatusBar = value));
    } else if (key === "journalPrompts" && typeof value === "string") {
      await this.state.update((settings) => (settings.journalPrompts = parsePrompts(value)));
    }
  }

  private save(mutate: (settings: MindfulFocusSettings) => void): void {
    handleAsync("Could not save settings", () => this.state.update(mutate))();
  }

  /** Settings screen for Obsidian versions before 1.13. */
  override display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl).setName("Folders").setHeading();
    for (const { key, name, desc } of FOLDERS) {
      new Setting(containerEl)
        .setName(name)
        .setDesc(desc)
        .addText((text) =>
          text
            .setPlaceholder(DEFAULT_SETTINGS[key])
            .setValue(this.state.settings[key])
            .onChange((value) => {
              const valid = !folderProblem(value);
              text.inputEl.toggleClass("mindful-focus-invalid", !valid);
              text.inputEl.setAttr("aria-invalid", String(!valid));
              if (!valid) return;
              this.save((settings) => {
                settings[key] = normalizeVaultPath(value) || DEFAULT_SETTINGS[key];
              });
            }),
        );
    }

    new Setting(containerEl).setName("Focus sessions").setHeading();
    new Setting(containerEl)
      .setName(SESSION_NAME)
      .setDesc(SESSION_DESC)
      .addText((text) => {
        text.inputEl.type = "number";
        text.inputEl.min = String(MIN_SESSION_MINUTES);
        text.inputEl.max = String(MAX_SESSION_MINUTES);
        text.setValue(String(this.state.settings.defaultSessionMinutes)).onChange((value) => {
          const minutes = Number(value);
          const valid = !minutesProblem(minutes);
          text.inputEl.toggleClass("mindful-focus-invalid", !valid);
          if (valid) this.save((settings) => (settings.defaultSessionMinutes = Math.round(minutes)));
        });
      });
    new Setting(containerEl)
      .setName(STATUS_BAR_NAME)
      .addToggle((toggle) =>
        toggle
          .setValue(this.state.settings.showStatusBar)
          .onChange((value) => this.save((settings) => (settings.showStatusBar = value))),
      );

    new Setting(containerEl).setName("Journal").setHeading();
    new Setting(containerEl)
      .setName(PROMPTS_NAME)
      .setDesc(PROMPTS_DESC)
      .addTextArea((area) => {
        area.inputEl.rows = 6;
        area.setValue(this.state.settings.journalPrompts.join("\n")).onChange((value) => {
          this.save((settings) => (settings.journalPrompts = parsePrompts(value)));
        });
      });

    new Setting(containerEl).setName(CATEGORIES_NAME).setDesc(CATEGORIES_DESC);
  }
}
