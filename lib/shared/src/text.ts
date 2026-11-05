/** Text and Markdown helpers. All functions are pure. */

/** Lower-case, hyphenated slug that keeps letters, marks and digits from any script. */
export function slugify(text: string, maxLength = 50): string {
  const slug = text
    .normalize("NFKD")
    // Drop Latin accents only; marks that other scripts need (Devanagari, Hebrew…) are kept.
    .replace(/[̀-ͯ]/g, "")
    .normalize("NFC")
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\s-]/gu, "")
    .trim()
    .replace(/[\s-]+/g, "-");
  return Array.from(slug).slice(0, maxLength).join("").replace(/-+$/, "");
}

export function truncate(text: string, maxLength: number): string {
  const chars = Array.from(text);
  return chars.length > maxLength ? `${chars.slice(0, maxLength).join("").trimEnd()}…` : text;
}

/**
 * Parses comma-separated tag input into valid Obsidian tags: no leading "#",
 * spaces become "-", only letters, marks, digits, "_", "-" and "/" are kept,
 * purely numeric tags are dropped, and duplicates are removed (case-insensitive).
 */
export function parseTags(input: string | readonly string[]): string[] {
  const parts = typeof input === "string" ? input.split(",") : input;
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const part of parts) {
    const tag = String(part)
      .normalize("NFC")
      .trim()
      .replace(/^#+/, "")
      .replace(/\s+/g, "-")
      .replace(/[^\p{L}\p{M}\p{N}_\-/]/gu, "")
      .replace(/^[-/]+|[-/]+$/g, "");
    if (!tag || /^\d+$/.test(tag)) continue;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    tags.push(tag);
  }
  return tags;
}

export function escapeTableCell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

/** Makes text safe to use as a single line in Markdown (headings, list items). */
export function singleLine(value: string): string {
  return value.replace(/\s*\r?\n\s*/g, " ").trim();
}

/**
 * Escapes characters that create links or HTML in Markdown (`\ [ ] < >`), for
 * text from outside sources such as Zotero that should be shown literally.
 */
export function escapeMarkdownInline(value: string): string {
  return singleLine(value).replace(/[\\[\]<>]/g, (char) => `\\${char}`);
}

interface Fence {
  char: string;
  length: number;
}

/** A CommonMark code fence opener/closer: ≤3 spaces, then ≥3 backticks or tildes. */
function parseFence(line: string): (Fence & { info: string }) | null {
  const match = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
  if (!match?.[1]) return null;
  const run = match[1];
  const info = match[2] ?? "";
  // "```code``` text" is inline code, not a fence: a backtick fence's info string has no backticks.
  if (run.startsWith("`") && info.includes("`")) return null;
  return { char: run.charAt(0), length: run.length, info: info.trim() };
}

/**
 * For each line, whether it is inside (or delimits) a fenced code block. An
 * unclosed fence is treated as a stray marker rather than hiding the rest of the note.
 */
function codeLineMask(lines: readonly string[]): boolean[] {
  const mask = lines.map(() => false);
  let open: Fence | null = null;
  let openedAt = -1;
  for (let index = 0; index < lines.length; index++) {
    const fence = parseFence(lines[index] ?? "");
    if (open) {
      mask[index] = true;
      if (fence && fence.char === open.char && fence.length >= open.length && fence.info === "") open = null;
    } else if (fence) {
      open = fence;
      openedAt = index;
      mask[index] = true;
    }
  }
  if (open) for (let index = openedAt; index < lines.length; index++) mask[index] = false;
  return mask;
}

/** Index of the first line equal to `heading` outside fenced code, or -1. */
function findHeadingLine(lines: readonly string[], heading: string): number {
  const inCode = codeLineMask(lines);
  const target = heading.trim();
  return lines.findIndex((line, index) => !inCode[index] && line.trim() === target);
}

/**
 * Inserts `block` directly under `heading` (newest entries first). When the
 * heading is missing it is appended to the end of the note together with the block.
 */
export function insertUnderHeading(content: string, heading: string, block: string): string {
  const lines = content.split("\n");
  const blockLines = block.trim().split("\n");
  const index = findHeadingLine(lines, heading);

  if (index === -1) {
    const trimmed = content.replace(/\s+$/, "");
    return `${trimmed}${trimmed ? "\n\n" : ""}${heading}\n\n${blockLines.join("\n")}\n`;
  }

  const before = lines.slice(0, index + 1);
  const after = lines.slice(index + 1);
  while (after.length > 0 && (after[0] ?? "").trim() === "") after.shift();
  const result = [...before, "", ...blockLines, ""];
  if (after.length > 0) result.push(...after);
  return result.join("\n");
}

/**
 * Replaces the text directly under `heading` only if it is still exactly one
 * of `previousBodies` — i.e. what the plugin wrote last time. Nothing has to
 * be guessed about where the section ends, so headings, rules or code fences
 * inside the text can't make it swallow the rest of the note.
 *
 * Returns null when the heading is missing or the user has edited the text;
 * the note should then be left as it is.
 */
export function replaceOwnedSection(
  content: string,
  heading: string,
  previousBodies: readonly string[],
  body: string,
): string | null {
  const lines = content.split("\n");
  const index = findHeadingLine(lines, heading);
  if (index === -1) return null;

  const head = lines.slice(0, index + 1).join("\n");
  const rest = lines.slice(index + 1).join("\n");
  const text = rest.slice((/^\s*/.exec(rest)?.[0] ?? "").length);

  for (const previous of previousBodies) {
    const expected = previous.trim();
    if (!expected || !text.startsWith(expected)) continue;
    const tail = text.slice(expected.length);
    if (tail !== "" && !tail.startsWith("\n")) continue;
    return `${head}\n\n${body.trim()}${tail}`;
  }
  return null;
}

/** Replaces the first line exactly equal to one of `previousLines`. Null when none is found. */
export function replaceExactLine(content: string, previousLines: readonly string[], line: string): string | null {
  const lines = content.split("\n");
  const index = lines.findIndex((candidate) => previousLines.includes(candidate));
  if (index === -1) return null;
  lines[index] = line;
  return lines.join("\n");
}

/**
 * Applies `transform` only to the part of the note before its first "## "
 * heading (the header area under the title), leaving the rest untouched.
 */
export function transformHeader(content: string, transform: (header: string) => string): string {
  const match = /^## /m.exec(content);
  const end = match ? match.index : content.length;
  return transform(content.slice(0, end)) + content.slice(end);
}
