import { noteCandidatePath, parentFolder } from "./paths";
import { insertUnderHeading } from "./text";

/**
 * The storage port the plugins write notes through. The Obsidian adapter lives
 * in `@orbitkit/shared/obsidian`; tests use the in-memory implementation from
 * `@orbitkit/shared/testing`.
 */
export interface NoteStore {
  /** True when a file or folder exists at the path. */
  exists(path: string): boolean;
  read(path: string): Promise<string>;
  /** Creates a new note and returns its actual path; fails if something already exists there. */
  create(path: string, content: string): Promise<string>;
  /** Atomically rewrites a note's content. */
  process(path: string, transform: (content: string) => string): Promise<void>;
  /** Updates frontmatter in place, preserving every other key and the note body. */
  updateFrontmatter(path: string, update: (frontmatter: Record<string, unknown>) => void): Promise<void>;
  /** Parsed frontmatter, or null when the note has none. Throws when the YAML is invalid. */
  readFrontmatter(path: string): Promise<Record<string, unknown> | null>;
  /** Path of a note whose frontmatter has `key: value`, or null. */
  findNoteByFrontmatter(key: string, value: string): Promise<string | null>;
  /** Creates the folder and any missing parents. */
  ensureFolder(path: string): Promise<void>;
  /** Moves a note to the trash configured in Obsidian. */
  trash(path: string): Promise<void>;
}

const MAX_NAME_ATTEMPTS = 500;

function isAlreadyExistsError(error: unknown): boolean {
  return error instanceof Error && /exist/i.test(error.message);
}

/**
 * Creates a note named `baseName` in `folder` without ever overwriting an
 * existing file: on a clash it tries "name 1", "name 2", … and returns the
 * path that was actually used. `isReserved` can veto paths that are still
 * claimed by other records even though the file is gone.
 */
export async function createUniqueNote(
  store: NoteStore,
  folder: string,
  baseName: string,
  content: string,
  isReserved: (path: string) => boolean = () => false,
): Promise<string> {
  if (folder) await store.ensureFolder(folder);
  for (let attempt = 0; attempt < MAX_NAME_ATTEMPTS; attempt++) {
    const path = noteCandidatePath(folder, baseName, attempt);
    if (store.exists(path) || isReserved(path)) continue;
    try {
      return await store.create(path, content);
    } catch (error) {
      // Another write (or a case-insensitive file system) claimed the name first.
      if (isAlreadyExistsError(error)) continue;
      throw error;
    }
  }
  throw new Error(`Could not find a free file name for "${baseName}" in "${folder || "/"}".`);
}

/** Creates the note from `template` if it does not exist yet. Returns true when created. */
export async function ensureNote(store: NoteStore, path: string, template: string): Promise<boolean> {
  if (store.exists(path)) return false;
  const folder = parentFolder(path);
  if (folder) await store.ensureFolder(folder);
  try {
    await store.create(path, template);
    return true;
  } catch (error) {
    // A concurrent write created the note between the check and the create: that's fine.
    if (isAlreadyExistsError(error) && store.exists(path)) return false;
    throw error;
  }
}

/** Inserts `block` under `heading` in the note, creating the note from `template` first if needed. */
export async function appendUnderHeading(
  store: NoteStore,
  path: string,
  heading: string,
  block: string,
  template: string,
): Promise<void> {
  await ensureNote(store, path, template);
  await store.process(path, (content) => insertUnderHeading(content, heading, block));
}

async function hasMarker(store: NoteStore, path: string, markerKey: string): Promise<boolean> {
  try {
    return (await store.readFrontmatter(path))?.[markerKey] === true;
  } catch {
    return false;
  }
}

/**
 * Writes a generated note (an export or report) whose frontmatter contains
 * `markerKey: true`. An existing note is only replaced when it carries the
 * same marker — i.e. it is a previous generated copy; any other note with that
 * name is left alone and "name 1", "name 2", … is used instead.
 */
export async function writeGeneratedNote(
  store: NoteStore,
  folder: string,
  baseName: string,
  content: string,
  markerKey: string,
): Promise<string> {
  if (folder) await store.ensureFolder(folder);
  for (let attempt = 0; attempt < MAX_NAME_ATTEMPTS; attempt++) {
    const path = noteCandidatePath(folder, baseName, attempt);
    if (!store.exists(path)) {
      if (await ensureNote(store, path, content)) return path;
    }
    if (await hasMarker(store, path, markerKey)) {
      await store.process(path, () => content);
      return path;
    }
  }
  throw new Error(`Could not find a free file name for "${baseName}" in "${folder || "/"}".`);
}

export type Ownership = "owned" | "not-owned" | "unknown";

/**
 * Whether the note at `path` belongs to the record `id`, judged by its
 * `idKey` frontmatter property. Notes without the property (written by older
 * versions) count as owned unless another record claims the same path.
 */
export async function noteOwnership(
  store: NoteStore,
  path: string,
  idKey: string,
  id: string,
  claimedByOthers: boolean,
): Promise<Ownership> {
  let frontmatter: Record<string, unknown> | null;
  try {
    frontmatter = await store.readFrontmatter(path);
  } catch {
    return "unknown";
  }
  const stored = frontmatter?.[idKey];
  if (typeof stored === "string" || typeof stored === "number") return String(stored) === id ? "owned" : "not-owned";
  return claimedByOthers ? "not-owned" : "owned";
}

/** What happened to a record's note after the record itself was saved. */
export type NoteSync =
  | { status: "updated" }
  | { status: "unchanged" }
  | { status: "no-note" }
  | { status: "kept-edits" }
  | { status: "unlinked" }
  | { status: "failed"; error: string };

/** A user-facing explanation for NoteSync outcomes that need one, or null. */
export function noteSyncMessage(noun: string, sync: NoteSync): string | null {
  switch (sync.status) {
    case "kept-edits":
      return `${noun} saved. You had edited that part of its note, so your text in the note was kept.`;
    case "unlinked":
      return `${noun} saved. Its note now belongs to something else, so the link to it was removed.`;
    case "failed":
      return `${noun} saved, but its note couldn't be updated: ${sync.error}`;
    default:
      return null;
  }
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
