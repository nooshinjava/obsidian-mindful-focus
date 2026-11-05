import type { SettingDefinitionItem } from "obsidian";

export interface ControlInfo {
  key: string;
  type: string;
  validate?: (value: never) => unknown;
}

/** Every `control` in a list of setting definitions, including those inside groups. */
export function collectControls(items: readonly SettingDefinitionItem[]): ControlInfo[] {
  const controls: ControlInfo[] = [];
  for (const item of items) {
    if ("items" in item && Array.isArray(item.items)) controls.push(...collectControls(item.items));
    if ("control" in item && item.control) controls.push(item.control);
  }
  return controls;
}
