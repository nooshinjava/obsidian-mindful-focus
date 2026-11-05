/**
 * Minimal YAML frontmatter writer. Strings are emitted as JSON strings, which
 * are valid YAML double-quoted scalars, so quotes, colons, "#" and newlines in
 * user input can never break the frontmatter or inject extra keys.
 */

export type FrontmatterValue = string | number | boolean | null | readonly string[];

const SAFE_KEY = /^[A-Za-z_][A-Za-z0-9_-]*$/;

export function yamlValue(value: FrontmatterValue): string {
  if (value === null) return "null";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "null";
  if (typeof value === "boolean") return String(value);
  if (typeof value === "string") return JSON.stringify(value);
  return `[${value.map((item) => JSON.stringify(String(item))).join(", ")}]`;
}

/**
 * Copies plugin-owned fields into a parsed frontmatter object (as given by
 * processFrontMatter). `undefined` removes the key; other keys are untouched.
 */
export function mergeFrontmatter(
  target: Record<string, unknown>,
  fields: Record<string, FrontmatterValue | undefined>,
): void {
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) delete target[key];
    else target[key] = typeof value === "object" && value !== null ? [...value] : value;
  }
}

export function serializeFrontmatter(fields: Record<string, FrontmatterValue | undefined>): string {
  const lines: string[] = [];
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) continue;
    if (!SAFE_KEY.test(key)) throw new Error(`Invalid frontmatter key: ${key}`);
    lines.push(`${key}: ${yamlValue(value)}`);
  }
  return `---\n${lines.join("\n")}\n---\n`;
}
