import { getFrontMatterInfo, normalizePath, parseYaml, TFile, TFolder, type App, type TAbstractFile } from "obsidian";
import { isRecord } from "../data";
import type { NoteStore } from "../notes";

/** NoteStore backed by the Obsidian vault, file manager and metadata cache. */
export class ObsidianNoteStore implements NoteStore {
  constructor(private readonly app: App) {}

  exists(path: string): boolean {
    return this.resolve(path) !== null;
  }

  async read(path: string): Promise<string> {
    return this.app.vault.read(this.getFile(path));
  }

  async create(path: string, content: string): Promise<string> {
    const target = this.withExistingFolderCase(normalizePath(path));
    const file = await this.app.vault.create(target, content);
    return file.path;
  }

  async process(path: string, transform: (content: string) => string): Promise<void> {
    await this.app.vault.process(this.getFile(path), transform);
  }

  async updateFrontmatter(
    path: string,
    update: (frontmatter: Record<string, unknown>) => void,
  ): Promise<void> {
    await this.app.fileManager.processFrontMatter(this.getFile(path), update);
  }

  async readFrontmatter(path: string): Promise<Record<string, unknown> | null> {
    const info = getFrontMatterInfo(await this.read(path));
    if (!info.exists) return null;
    const data: unknown = parseYaml(info.frontmatter);
    return isRecord(data) ? data : {};
  }

  findNoteByFrontmatter(key: string, value: string): Promise<string | null> {
    for (const file of this.app.vault.getMarkdownFiles()) {
      const stored: unknown = this.app.metadataCache.getFileCache(file)?.frontmatter?.[key];
      if ((typeof stored === "string" || typeof stored === "number") && String(stored) === value) {
        return Promise.resolve(file.path);
      }
    }
    return Promise.resolve(null);
  }

  async ensureFolder(path: string): Promise<void> {
    let current = "";
    for (const segment of normalizePath(path).split("/").filter(Boolean)) {
      const wanted = current ? `${current}/${segment}` : segment;
      const existing = this.resolve(wanted);
      if (existing instanceof TFolder) {
        current = existing.path;
      } else if (existing) {
        throw new Error(`"${wanted}" exists but is not a folder.`);
      } else {
        await this.app.vault.createFolder(wanted);
        current = wanted;
      }
    }
  }

  async trash(path: string): Promise<void> {
    await this.app.fileManager.trashFile(this.getFile(path));
  }

  getFile(path: string): TFile {
    const file = this.resolve(path);
    if (!(file instanceof TFile)) throw new Error(`"${path}" is not a note.`);
    return file;
  }

  /**
   * Finds a file or folder by exact path, falling back to a case-insensitive
   * match so a folder setting of "ideas" works with an existing "Ideas" folder
   * on case-insensitive file systems (macOS, Windows).
   */
  private resolve(path: string): TAbstractFile | null {
    const normalized = normalizePath(path);
    const exact = this.app.vault.getAbstractFileByPath(normalized);
    if (exact) return exact;
    let current: TAbstractFile = this.app.vault.getRoot();
    for (const segment of normalized.split("/").filter(Boolean)) {
      if (!(current instanceof TFolder)) return null;
      const lower = segment.toLowerCase();
      const next: TAbstractFile | undefined = current.children.find((child) => child.name.toLowerCase() === lower);
      if (!next) return null;
      current = next;
    }
    return current === this.app.vault.getRoot() ? null : current;
  }

  /** Rewrites the folder part of `path` to the spelling of the folder that already exists. */
  private withExistingFolderCase(path: string): string {
    const index = path.lastIndexOf("/");
    if (index === -1) return path;
    const folder = this.resolve(path.slice(0, index));
    return folder instanceof TFolder ? `${folder.path}/${path.slice(index + 1)}` : path;
  }
}

/** Opens a note in the active tab (or a new tab when `newTab` is true). */
export async function openNote(app: App, path: string, newTab = false): Promise<void> {
  const file = app.vault.getAbstractFileByPath(normalizePath(path));
  if (!(file instanceof TFile)) throw new Error(`"${path}" is not a note.`);
  await app.workspace.getLeaf(newTab).openFile(file);
}
