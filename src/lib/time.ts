/**
 * Timezone helpers built on Intl only (no date library needed).
 *
 * Everything in the database is stored as an absolute instant (timestamptz).
 * A farm has a timezone, and "today" / "this month" / "6:00 AM" are always
 * computed in that timezone, never in the server's — Vercel runs in UTC.
 */

export type Parts = { year: number; month: number; day: number; hour: number; minute: number; second: number };

const partCache = new Map<string, Intl.DateTimeFormat>();

function formatter(tz: string) {
  let f = partCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
    });
    partCache.set(tz, f);
  }
  return f;
}

/** Wall-clock components of an instant in the given timezone. */
export function toParts(date: Date, tz: string): Parts {
  const p: Record<string, number> = {};
  for (const { type, value } of formatter(tz).formatToParts(date)) {
    if (type !== "literal") p[type] = Number(value);
  }
  return { year: p.year, month: p.month, day: p.day, hour: p.hour % 24, minute: p.minute, second: p.second };
}

/** Instant for a wall-clock time in the given timezone (handles DST). */
export function fromParts(parts: Partial<Parts> & { year: number; month: number; day: number }, tz: string): Date {
  const { year, month, day, hour = 0, minute = 0, second = 0 } = parts;
  // First guess: treat the wall-clock time as UTC, then correct by the zone's
  // offset at that instant. Two passes handle the DST edge.
  let guess = Date.UTC(year, month - 1, day, hour, minute, second);
  for (let i = 0; i < 2; i++) {
    const got = toParts(new Date(guess), tz);
    const gotUtc = Date.UTC(got.year, got.month - 1, got.day, got.hour, got.minute, got.second);
    const wantUtc = Date.UTC(year, month - 1, day, hour, minute, second);
    guess += wantUtc - gotUtc;
  }
  return new Date(guess);
}

/**
 * Spoken times are clock times without a date ("10:00", "12:00"). A voice log
 * describes work already done, so each one resolves to the most recent instant
 * with that wall-clock time at or before `capturedAt`: "10:00" spoken at
 * 12:21 AM is yesterday's 10:00, not a future one. A start that still lands
 * after the end means the work crossed midnight, so it moves back a day too.
 * Missing end → the moment of recording; missing start → 90 minutes before
 * the end; an implausible span (>16 h, i.e. the times were garbled) → the
 * same 90-minute window before the end.
 */
export function resolveSpokenRange(
  start: string | null | undefined,
  end: string | null | undefined,
  capturedAt: Date,
  tz: string,
): { startedAt: Date; endedAt: Date } {
  const parse = (hm: string | null | undefined) => {
    const m = hm?.match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return null;
    const hour = Number(m[1]);
    const minute = Number(m[2]);
    return hour < 24 && minute < 60 ? { hour, minute } : null;
  };
  const local = toParts(capturedAt, tz);
  // Date.UTC normalises day 0 / -1 into the previous month, so no calendar math.
  const onDay = (t: { hour: number; minute: number }, daysBack: number) =>
    fromParts({ year: local.year, month: local.month, day: local.day - daysBack, hour: t.hour, minute: t.minute }, tz);
  const latestAtOrBefore = (t: { hour: number; minute: number }, limit: Date) => {
    for (let back = 0; back < 3; back++) {
      const candidate = onDay(t, back);
      if (candidate <= limit) return candidate;
    }
    return onDay(t, 2);
  };

  const endClock = parse(end);
  const startClock = parse(start);
  const endedAt = endClock ? latestAtOrBefore(endClock, capturedAt) : capturedAt;
  const fallbackStart = new Date(endedAt.getTime() - 90 * 60_000);
  if (!startClock) return { startedAt: fallbackStart, endedAt };

  const startedAt = latestAtOrBefore(startClock, endedAt);
  const spanMs = endedAt.getTime() - startedAt.getTime();
  if (spanMs <= 0 || spanMs > 16 * 60 * 60_000) return { startedAt: fallbackStart, endedAt };
  return { startedAt, endedAt };
}

export function startOfDay(date: Date, tz: string): Date {
  const { year, month, day } = toParts(date, tz);
  return fromParts({ year, month, day }, tz);
}

export function addDays(date: Date, days: number, tz: string): Date {
  const p = toParts(date, tz);
  return fromParts({ ...p, day: p.day + days }, tz);
}

export function startOfMonth(date: Date, tz: string): Date {
  const { year, month } = toParts(date, tz);
  return fromParts({ year, month, day: 1 }, tz);
}

export function startOfNextMonth(date: Date, tz: string): Date {
  const { year, month } = toParts(date, tz);
  return fromParts({ year, month: month + 1, day: 1 }, tz);
}

/** "April 19, 2026" */
export function formatDate(date: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: tz, month: "long", day: "numeric", year: "numeric" }).format(date);
}

/** "6:00 AM" */
export function formatTime(date: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" }).format(date);
}

/** "6:00 AM - 10:40 AM" (the hyphen is what the design uses) */
export function formatTimeRange(start: Date, end: Date, tz: string): string {
  return `${formatTime(start, tz)} - ${formatTime(end, tz)}`;
}

/** "0:42" for audio durations */
export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
