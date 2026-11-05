import type { App, Plugin } from "obsidian";
import { describe, expect, it } from "vitest";
import { collectControls } from "@orbitkit/shared/testing";
import { DEFAULT_SETTINGS } from "../src/domain/constants";
import { MindfulFocusSettingTab } from "../src/ui/settings-tab";
import { setup } from "./fixtures";

async function tabWithState() {
  const { services, persistence } = await setup({ schemaVersion: 2 });
  return { tab: new MindfulFocusSettingTab({} as App, {} as Plugin, services.state), state: services.state, persistence };
}

describe("Mindful Focus settings definitions (Obsidian 1.13+)", () => {
  it("covers every setting with a readable value", async () => {
    const { tab } = await tabWithState();
    const keys = collectControls(tab.getSettingDefinitions()).map((control) => control.key);
    expect(keys).toEqual(["dailyFolderPath", "weeklyFolderPath", "labbookFolderPath", "defaultSessionMinutes", "showStatusBar", "journalPrompts"]);
    for (const key of keys) expect(tab.getControlValue(key)).toBeDefined();
    expect(tab.getControlValue("journalPrompts")).toBe(DEFAULT_SETTINGS.journalPrompts.join("\n"));
  });

  it("saves values in the shape the plugin stores", async () => {
    const { tab, state } = await tabWithState();
    await tab.setControlValue("dailyFolderPath", " Journal/Daily/ ");
    await tab.setControlValue("weeklyFolderPath", "");
    await tab.setControlValue("defaultSessionMinutes", 45.4);
    await tab.setControlValue("showStatusBar", false);
    await tab.setControlValue("journalPrompts", "  First\n\nSecond  ");
    expect(state.settings).toMatchObject({
      dailyFolderPath: "Journal/Daily",
      weeklyFolderPath: DEFAULT_SETTINGS.weeklyFolderPath,
      defaultSessionMinutes: 45,
      showStatusBar: false,
      journalPrompts: ["First", "Second"],
    });
  });

  it("never saves invalid values, and explains kindly", async () => {
    const { tab, state } = await tabWithState();
    await tab.setControlValue("defaultSessionMinutes", 5000);
    await tab.setControlValue("journalPrompts", "   ");
    expect(state.settings.defaultSessionMinutes).toBe(DEFAULT_SETTINGS.defaultSessionMinutes);
    expect(state.settings.journalPrompts).toEqual(DEFAULT_SETTINGS.journalPrompts);
    const controls = collectControls(tab.getSettingDefinitions());
    const minutes = controls.find((control) => control.key === "defaultSessionMinutes")?.validate as (value: number) => unknown;
    const folder = controls.find((control) => control.key === "labbookFolderPath")?.validate as (value: string) => unknown;
    expect(minutes(0)).toMatch(/^Please choose between/);
    expect(minutes(30)).toBeUndefined();
    expect(folder("../up")).toMatch(/^Please choose a folder inside this vault/);
  });
});
