import { Notice, type App, type WorkspaceLeaf } from "obsidian";

/** Reveals the plugin's own sidebar view, creating it in the right sidebar if needed. */
export async function revealView(app: App, viewType: string): Promise<WorkspaceLeaf | null> {
  const { workspace } = app;
  let leaf: WorkspaceLeaf | null = workspace.getLeavesOfType(viewType)[0] ?? null;
  if (!leaf) {
    leaf = workspace.getRightLeaf(false);
    if (!leaf) return null;
    await leaf.setViewState({ type: viewType, active: true });
  }
  await workspace.revealLeaf(leaf);
  return leaf;
}

/**
 * Opens a view owned by another OrbitKit plugin. If that plugin is not
 * enabled, the empty leaf is closed again and the user is told what to enable.
 */
export async function revealSiblingView(app: App, viewType: string, pluginName: string): Promise<void> {
  const leaf = await revealView(app, viewType);
  if (leaf && leaf.view.getViewType() !== viewType) {
    leaf.detach();
    new Notice(`Enable the ${pluginName} plugin to open it from here.`);
  }
}

/** Re-renders every open instance of a view. */
export function forEachView<T>(app: App, viewType: string, isView: (view: unknown) => view is T, callback: (view: T) => void): void {
  for (const leaf of app.workspace.getLeavesOfType(viewType)) {
    if (isView(leaf.view)) callback(leaf.view);
  }
}
