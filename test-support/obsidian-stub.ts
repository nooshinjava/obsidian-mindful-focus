/**
 * Runtime stand-in for the `obsidian` module in unit tests. The real package
 * only ships type definitions. Services are tested through the NoteStore port;
 * the file classes and YAML helpers here are just enough to exercise the
 * Obsidian adapters against a fake vault.
 */
import { parse } from "yaml";

export class Notice {
  static readonly messages: string[] = [];
  constructor(message: string) {
    Notice.messages.push(message);
  }
}

export class Plugin {}
export class ItemView {}
export class Modal {}
export class PluginSettingTab {}
export class Setting {}

export class TAbstractFile {
  name = "";
  path = "";
  parent: TFolder | null = null;
}

export class TFile extends TAbstractFile {}

export class TFolder extends TAbstractFile {
  children: TAbstractFile[] = [];
}

export function normalizePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/\/+/g, "/").replace(/^\/|\/$/g, "");
}

export function getFrontMatterInfo(content: string): { exists: boolean; frontmatter: string } {
  const match = /^---\n([\s\S]*?)\n---/.exec(content);
  return match ? { exists: true, frontmatter: match[1] ?? "" } : { exists: false, frontmatter: "" };
}

export function parseYaml(text: string): unknown {
  return parse(text);
}
