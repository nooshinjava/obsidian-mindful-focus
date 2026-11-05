/**
 * Vault path helpers. Vault paths are always relative, use "/" separators and
 * never contain "." or ".." segments, so user input can't escape the vault.
 */

// Characters that are invalid on common file systems or break Obsidian links.
const INVALID_FILE_NAME_CHARS = /[\\/:*?"<>|#^[\]]/g;
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/g;
// eslint-disable-next-line no-control-regex
const HAS_CONTROL_CHARS = /[\u0000-\u001f\u007f]/;
const WINDOWS_RESERVED_NAME = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;
const MAX_FILE_NAME_LENGTH = 100;

export function normalizeVaultPath(input: string | null | undefined): string {
  return (input ?? "")
    .normalize("NFC")
    .replace(/\u00a0/g, " ")
    .replace(/\\/g, "/")
    .split("/")
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0)
    .join("/");
}

/**
 * True when the path is a non-empty, relative path inside the vault: no
 * traversal ("..", "."), no hidden segments (such as ".obsidian"), no drive
 * letters and no control characters.
 */
export function isSafeVaultPath(input: string | null | undefined): boolean {
  const raw = (input ?? "").trim();
  if (!raw || HAS_CONTROL_CHARS.test(raw) || /^[a-z]:/i.test(raw)) return false;
  const path = normalizeVaultPath(raw);
  if (!path) return false;
  return path.split("/").every((segment) => !segment.startsWith("."));
}

/** Normalizes a user-supplied folder setting, falling back when it is unsafe. */
export function resolveFolderSetting(input: string | null | undefined, fallback: string): string {
  const path = normalizeVaultPath(input);
  return path && isSafeVaultPath(path) ? path : normalizeVaultPath(fallback);
}

export function joinVaultPath(...segments: Array<string | null | undefined>): string {
  return normalizeVaultPath(segments.filter((segment) => segment).join("/"));
}

export function parentFolder(path: string): string {
  const normalized = normalizeVaultPath(path);
  const index = normalized.lastIndexOf("/");
  return index === -1 ? "" : normalized.slice(0, index);
}

export function fileNameOf(path: string): string {
  const normalized = normalizeVaultPath(path);
  return normalized.slice(normalized.lastIndexOf("/") + 1);
}

export function stripMarkdownExtension(name: string): string {
  return name.replace(/\.md$/i, "");
}

export function isMarkdownPath(path: string): boolean {
  return /\.md$/i.test(path);
}

/** Turns arbitrary text into a file name that is valid everywhere Obsidian runs. */
export function toSafeFileName(name: string, fallback = "Untitled"): string {
  const cleaned = name
    .normalize("NFC")
    .replace(CONTROL_CHARS, "")
    .replace(INVALID_FILE_NAME_CHARS, "-")
    .replace(/\s+/g, " ")
    .replace(/-{2,}/g, "-")
    .replace(/^[\s.-]+|[\s.-]+$/g, "");
  const truncated = Array.from(cleaned).slice(0, MAX_FILE_NAME_LENGTH).join("").trim();
  if (!truncated) return fallback;
  return WINDOWS_RESERVED_NAME.test(truncated) ? `${truncated}-note` : truncated;
}

/** The path for `baseName` in `folder`, or the same name with " 1", " 2", … appended. */
export function noteCandidatePath(folder: string, baseName: string, attempt: number): string {
  const safeBase = toSafeFileName(stripMarkdownExtension(baseName));
  const name = attempt === 0 ? safeBase : `${safeBase} ${attempt}`;
  return joinVaultPath(folder, `${name}.md`);
}
