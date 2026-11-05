import {
  formatIsoDate,
  isMarkdownPath,
  isSafeVaultPath,
  joinVaultPath,
  normalizeVaultPath,
  parentFolder,
  toSafeFileName,
} from "@orbitkit/shared";
import { LABBOOK_FILE_NAME } from "./constants";
import type { MindfulFocusSettings } from "./types";

type FolderSettings = Pick<MindfulFocusSettings, "dailyFolderPath" | "weeklyFolderPath" | "labbookFolderPath">;

export function dailyNotePath(settings: FolderSettings, date: Date): string {
  return joinVaultPath(settings.dailyFolderPath, `${formatIsoDate(date)}.md`);
}

export function weeklyPlanPath(settings: FolderSettings, weekId: string): string {
  return joinVaultPath(settings.weeklyFolderPath, `${weekId}-Plan.md`);
}

export function weeklyReportPath(settings: FolderSettings, weekStart: string): string {
  return joinVaultPath(settings.weeklyFolderPath, `Weekly_Report_${weekStart}.md`);
}

export function defaultLabbookPath(settings: FolderSettings, goalName: string): string {
  return joinVaultPath(settings.labbookFolderPath, toSafeFileName(goalName, "Project"));
}

function safeLabbookPath(labbookPath: string | undefined): string {
  const path = normalizeVaultPath(labbookPath);
  if (!path) throw new Error("This goal has no labbook yet.");
  if (!isSafeVaultPath(path)) throw new Error("please choose a labbook path inside this vault.");
  return path;
}

/** The labbook note: the path itself when it ends in .md, otherwise "<folder>/Labbook.md". */
export function labbookNotePath(labbookPath: string | undefined): string {
  const path = safeLabbookPath(labbookPath);
  return isMarkdownPath(path) ? path : joinVaultPath(path, LABBOOK_FILE_NAME);
}

/** The folder extra labbook notes go into ("" when the labbook note sits at the vault root). */
export function labbookFolderPath(labbookPath: string | undefined): string {
  const path = safeLabbookPath(labbookPath);
  return isMarkdownPath(path) ? parentFolder(path) : path;
}
