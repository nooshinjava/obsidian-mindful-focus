import { parse, stringify } from "yaml";
import { isRecord } from "../data";
import type { NoteStore } from "../notes";

const FRONTMATTER = /^---\n([\s\S]*?)\n---\n?/;

/** Path normalization equivalent to Obsidian's `normalizePath`. */
function normalize(path: string): string {
  return path.replace(/\\/g, "/").replace(/\/+/g, "/").replace(/^\/|\/$/g, "").normalize("NFC");
}

function parentOf(path: string): string {
  const index = path.lastIndexOf("/");
  return index === -1 ? "" : path.slice(0, index);
}

function parseFrontmatter(content: string): Record<string, unknown> | null {
  const match = FRONTMATTER.exec(content);
  if (!match) return null;
  const data: unknown = parse(match[1] ?? "");
  return isRecord(data) ? data : {};
}

/** In-memory NoteStore that mirrors the Obsidian adapter's behaviour, for tests. */
export class MemoryNoteStore implements NoteStore {
  readonly files = new Map<string, string>();
  readonly folders = new Set<string>();
  readonly trashed: string[] = [];

  constructor(initialFiles: Record<string, string> = {}) {
    for (const [path, content] of Object.entries(initialFiles)) {
      const normalized = normalize(path);
      const folder = parentOf(normalized);
      if (folder) this.addFolderChain(folder);
      this.files.set(normalized, content);
    }
  }

  exists(path: string): boolean {
    const normalized = normalize(path);
    return this.files.has(normalized) || this.folders.has(normalized);
  }

  read(path: string): Promise<string> {
    const content = this.files.get(normalize(path));
    if (content === undefined) return Promise.reject(new Error(`"${path}" is not a note.`));
    return Promise.resolve(content);
  }

  create(path: string, content: string): Promise<string> {
    const normalized = normalize(path);
    if (this.exists(normalized)) return Promise.reject(new Error("File already exists."));
    const folder = parentOf(normalized);
    if (folder && !this.folders.has(folder)) {
      return Promise.reject(new Error(`Folder "${folder}" does not exist.`));
    }
    this.files.set(normalized, content);
    return Promise.resolve(normalized);
  }

  /** Read-modify-write in one step, like Obsidian's atomic `vault.process`. */
  process(path: string, transform: (content: string) => string): Promise<void> {
    const normalized = normalize(path);
    const content = this.files.get(normalized);
    if (content === undefined) return Promise.reject(new Error(`"${path}" is not a note.`));
    try {
      this.files.set(normalized, transform(content));
      return Promise.resolve();
    } catch (error) {
      return Promise.reject(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /** Like processFrontMatter: rejects when the existing YAML can't be parsed. */
  async updateFrontmatter(
    path: string,
    update: (frontmatter: Record<string, unknown>) => void,
  ): Promise<void> {
    const content = await this.read(path);
    const match = FRONTMATTER.exec(content);
    const frontmatter = parseFrontmatter(content) ?? {};
    update(frontmatter);
    const body = match ? content.slice(match[0].length) : content;
    this.files.set(normalize(path), `---\n${stringify(frontmatter)}---\n${body}`);
  }

  async readFrontmatter(path: string): Promise<Record<string, unknown> | null> {
    return parseFrontmatter(await this.read(path));
  }

  findNoteByFrontmatter(key: string, value: string): Promise<string | null> {
    for (const [path, content] of this.files) {
      if (!path.endsWith(".md")) continue;
      try {
        const stored = parseFrontmatter(content)?.[key];
        if ((typeof stored === "string" || typeof stored === "number") && String(stored) === value) {
          return Promise.resolve(path);
        }
      } catch {
        // Unparsable frontmatter isn't in Obsidian's metadata cache either.
      }
    }
    return Promise.resolve(null);
  }

  ensureFolder(path: string): Promise<void> {
    try {
      this.addFolderChain(normalize(path));
      return Promise.resolve();
    } catch (error) {
      return Promise.reject(error instanceof Error ? error : new Error(String(error)));
    }
  }

  trash(path: string): Promise<void> {
    const normalized = normalize(path);
    if (!this.files.delete(normalized)) return Promise.reject(new Error(`"${path}" is not a note.`));
    this.trashed.push(normalized);
    return Promise.resolve();
  }

  /** Simulates a file removed outside Obsidian (Finder, git, sync) — no events fire. */
  removeExternally(path: string): void {
    this.files.delete(normalize(path));
  }

  /** Parsed frontmatter of a note, for assertions. */
  frontmatterOf(path: string): Record<string, unknown> {
    return parseFrontmatter(this.files.get(normalize(path)) ?? "") ?? {};
  }

  private addFolderChain(folder: string): void {
    let current = "";
    for (const segment of folder.split("/").filter(Boolean)) {
      current = current ? `${current}/${segment}` : segment;
      if (this.files.has(current)) throw new Error(`"${current}" exists but is not a folder.`);
      this.folders.add(current);
    }
  }
}
