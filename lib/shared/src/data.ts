/**
 * Defensive readers for data loaded from data.json. Plugin data can be edited
 * by hand, synced from an older version or partially corrupted, so every field
 * is validated instead of trusted.
 */

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function readString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

export function readNumber(
  value: unknown,
  fallback: number,
  { min = -Infinity, max = Infinity }: { min?: number; max?: number } = {},
): number {
  const number = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  if (typeof number !== "number" || !Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

export function readBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

export function readStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

export function readEnum<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

export function readIsoTimestamp(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  return Number.isNaN(new Date(value).getTime()) ? fallback : value;
}

export type SchemaStatus = "current" | "outdated" | "newer";

/**
 * Compares the stored `schemaVersion` with the version this build understands.
 * "outdated" data should be migrated and saved; "newer" data comes from a
 * newer plugin version and must not be silently downgraded.
 */
export function schemaStatus(raw: unknown, currentVersion: number): SchemaStatus {
  const version = isRecord(raw) ? raw.schemaVersion : undefined;
  if (typeof version !== "number" || !Number.isFinite(version) || version < currentVersion) return "outdated";
  return version > currentVersion ? "newer" : "current";
}

/** Copies plain JSON data so defaults are never shared (and mutated) between loads. */
export function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
