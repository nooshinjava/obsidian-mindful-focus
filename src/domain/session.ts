import type { ActiveSession } from "./types";

/** Whole minutes elapsed since the session started (never negative). */
export function elapsedMinutes(session: ActiveSession, now: Date): number {
  return Math.floor(elapsedSeconds(session, now) / 60);
}

export function elapsedSeconds(session: ActiveSession, now: Date): number {
  const started = new Date(session.startedAt).getTime();
  if (Number.isNaN(started)) return 0;
  return Math.max(0, Math.floor((now.getTime() - started) / 1000));
}

/** The most time a single session can record (24 hours). */
export const MAX_RECORDED_MINUTES = 24 * 60;

/**
 * True when a session has stayed open well past its plan — usually because
 * it was left running. Instead of guessing, the plugin then gently asks how
 * much of the time to record.
 */
export function needsCheckIn(session: ActiveSession, now: Date, maxSessionMinutes: number): boolean {
  const elapsed = elapsedMinutes(session, now);
  const grace = Math.max(30, Math.round(session.plannedMinutes / 2));
  return elapsed > session.plannedMinutes + grace || elapsed > maxSessionMinutes;
}

/** Minutes the user chose to record, kept between 0 and the time the session was actually open. */
export function clampRecordedMinutes(minutes: number, elapsed: number): number {
  if (!Number.isFinite(minutes)) return 0;
  return Math.max(0, Math.min(Math.round(minutes), elapsed, MAX_RECORDED_MINUTES));
}

function plural(value: number, unit: string): string {
  return `${value} ${unit}${value === 1 ? "" : "s"}`;
}

/** "45 minutes", "1 hour and 10 minutes", "2 days and 4 hours". */
export function formatDurationWords(totalMinutes: number): string {
  const minutes = Math.max(0, Math.round(totalMinutes));
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const rest = minutes % 60;
  if (days > 0) return hours > 0 ? `${plural(days, "day")} and ${plural(hours, "hour")}` : plural(days, "day");
  if (hours > 0) return rest > 0 ? `${plural(hours, "hour")} and ${plural(rest, "minute")}` : plural(hours, "hour");
  return plural(rest, "minute");
}

/** "16:05", "yesterday at 16:05" or "Friday at 16:05" for when a session started. */
export function startedLabel(session: ActiveSession, now: Date, clock: (date: Date) => string): string {
  const started = new Date(session.startedAt);
  if (Number.isNaN(started.getTime())) return "earlier";
  const startDay = new Date(started.getFullYear(), started.getMonth(), started.getDate()).getTime();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const days = Math.round((today - startDay) / 86_400_000);
  if (days <= 0) return clock(started);
  if (days === 1) return `yesterday at ${clock(started)}`;
  if (days < 7) return `${started.toLocaleDateString(undefined, { weekday: "long" })} at ${clock(started)}`;
  return `${started.toLocaleDateString(undefined, { month: "long", day: "numeric" })} at ${clock(started)}`;
}

/** "05:09" below an hour, "1:05:09" from one hour on. */
export function formatElapsed(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  const mm = String(minutes).padStart(2, "0");
  const ss = String(secs).padStart(2, "0");
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}
