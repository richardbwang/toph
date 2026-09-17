import "server-only";
import { and, asc, count, desc, eq, gte, ilike, inArray, lt, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { activityLogs, fields, logTags, recordings, tags, users, type ActivityType, type LogStatus } from "@/db/schema";
import { ACTIVITY_LABELS, type LogFilters, type PeriodKey, type SortKey, type StatusKey } from "@/lib/filters";
import { addDays, startOfDay, startOfMonth, startOfNextMonth } from "@/lib/time";

function periodRange(period: PeriodKey, now: Date, tz: string): { from: Date; to: Date } | null {
  switch (period) {
    case "today":
      return { from: startOfDay(now, tz), to: addDays(startOfDay(now, tz), 1, tz) };
    case "week":
      return { from: addDays(startOfDay(now, tz), -6, tz), to: addDays(startOfDay(now, tz), 1, tz) };
    case "month":
      return { from: startOfMonth(now, tz), to: startOfNextMonth(now, tz) };
    case "all":
      return null;
  }
}

function statusList(status: StatusKey): LogStatus[] | null {
  switch (status) {
    case "new":
      return ["NEW"];
    case "reviewed":
      return ["REVIEWED"];
    case "flagged":
      return ["FLAGGED"];
    case "all":
      return null;
  }
}

function whereFor(farmId: string, f: LogFilters, tz: string, now = new Date()): SQL {
  const clauses: SQL[] = [eq(activityLogs.farmId, farmId)];
  const range = periodRange(f.period, now, tz);
  if (range) clauses.push(gte(activityLogs.startedAt, range.from), lt(activityLogs.startedAt, range.to));
  const statuses = statusList(f.status);
  if (statuses) clauses.push(inArray(activityLogs.status, statuses));
  if (f.activity) clauses.push(eq(activityLogs.activity, f.activity));
  if (f.field) clauses.push(eq(activityLogs.fieldId, f.field));
  if (f.q) {
    const like = `%${f.q.replace(/[%_]/g, "\\$&")}%`;
    const matchingActivities = (Object.keys(ACTIVITY_LABELS) as ActivityType[]).filter((k) =>
      ACTIVITY_LABELS[k].toLowerCase().includes(f.q.toLowerCase()),
    );
    clauses.push(
      or(
        ilike(users.name, like),
        ilike(fields.name, like),
        ilike(activityLogs.product, like),
        matchingActivities.length ? inArray(activityLogs.activity, matchingActivities) : sql`false`,
      )!,
    );
  }
  return and(...clauses)!;
}

function orderFor(sort: SortKey): SQL[] {
  switch (sort) {
    case "date-asc":
      return [asc(activityLogs.startedAt), asc(activityLogs.createdAt)];
    case "date-desc":
      return [desc(activityLogs.startedAt), desc(activityLogs.createdAt)];
    case "employee":
      return [asc(users.name), asc(activityLogs.startedAt)];
    case "activity":
      return [asc(activityLogs.activity), asc(activityLogs.startedAt)];
    case "accuracy":
      return [desc(activityLogs.responseAccuracy), asc(activityLogs.startedAt)];
    case "none":
      return [desc(activityLogs.createdAt)];
  }
}

// ───────────────────────────── Reads ─────────────────────────────

export type LogRow = Awaited<ReturnType<typeof listLogs>>["rows"][number];

/**
 * The rows for the logs table, already joined with everything the expanded
 * view needs (recording, field geometry, tags), so expanding a row is a pure
 * client-side state change — no second request.
 */
export async function listLogs(farmId: string, f: LogFilters, tz: string, limit = 200) {
  const where = whereFor(farmId, f, tz);

  const base = db
    .select({
      id: activityLogs.id,
      activity: activityLogs.activity,
      startedAt: activityLogs.startedAt,
      endedAt: activityLogs.endedAt,
      product: activityLogs.product,
      quantity: activityLogs.quantity,
      unit: activityLogs.unit,
      summary: activityLogs.summary,
      responseAccuracy: activityLogs.responseAccuracy,
      status: activityLogs.status,
      reviewedAt: activityLogs.reviewedAt,
      createdAt: activityLogs.createdAt,
      worker: { id: users.id, name: users.name, avatarUrl: users.avatarUrl },
      field: {
        id: fields.id,
        name: fields.name,
        crop: fields.crop,
        centerLat: fields.centerLat,
        centerLng: fields.centerLng,
        boundary: fields.boundary,
      },
      recording: {
        id: recordings.id,
        audioUrl: recordings.audioUrl,
        hasInlineAudio: sql<boolean>`${recordings.audioData} is not null`,
        durationSec: recordings.durationSec,
        waveform: recordings.waveform,
        transcript: recordings.transcript,
        capturedAt: recordings.capturedAt,
        status: recordings.status,
      },
    })
    .from(activityLogs)
    .innerJoin(users, eq(activityLogs.workerId, users.id))
    .leftJoin(fields, eq(activityLogs.fieldId, fields.id))
    .leftJoin(recordings, eq(activityLogs.recordingId, recordings.id))
    .where(where)
    .orderBy(...orderFor(f.sort))
    .limit(limit);

  const [rows, [{ total }], tagRows] = await Promise.all([
    base,
    db
      .select({ total: count() })
      .from(activityLogs)
      .innerJoin(users, eq(activityLogs.workerId, users.id))
      .leftJoin(fields, eq(activityLogs.fieldId, fields.id))
      .where(where),
    db
      .select({ logId: logTags.logId, id: tags.id, name: tags.name })
      .from(logTags)
      .innerJoin(tags, eq(logTags.tagId, tags.id))
      .innerJoin(activityLogs, eq(logTags.logId, activityLogs.id))
      .where(eq(activityLogs.farmId, farmId)),
  ]);

  const tagsByLog = new Map<string, { id: string; name: string }[]>();
  for (const t of tagRows) {
    const list = tagsByLog.get(t.logId) ?? [];
    list.push({ id: t.id, name: t.name });
    tagsByLog.set(t.logId, list);
  }

  return {
    total,
    rows: rows.map((r) => ({
      ...r,
      // A recording stored inline is served by the API route; static clips by URL.
      audioSrc: r.recording ? (r.recording.audioUrl ?? (r.recording.hasInlineAudio ? `/api/recordings/${r.recording.id}/audio` : null)) : null,
      tags: tagsByLog.get(r.id) ?? [],
    })),
  };
}

export type DashboardStats = Awaited<ReturnType<typeof dashboardStats>>;

export async function dashboardStats(farmId: string, tz: string, now = new Date()) {
  const dayStart = startOfDay(now, tz);
  const dayEnd = addDays(dayStart, 1, tz);
  const monthStart = startOfMonth(now, tz);
  const monthEnd = startOfNextMonth(now, tz);

  const [[recs], [newToday], [workers], [accuracy]] = await Promise.all([
    db
      .select({ n: count() })
      .from(recordings)
      .where(and(eq(recordings.farmId, farmId), gte(recordings.capturedAt, dayStart), lt(recordings.capturedAt, dayEnd))),
    db
      .select({ n: count() })
      .from(recordings)
      .innerJoin(activityLogs, eq(activityLogs.recordingId, recordings.id))
      .where(
        and(
          eq(recordings.farmId, farmId),
          gte(recordings.capturedAt, dayStart),
          lt(recordings.capturedAt, dayEnd),
          eq(activityLogs.status, "NEW"),
        ),
      ),
    db
      .select({ n: count() })
      .from(users)
      .where(and(eq(users.farmId, farmId), eq(users.role, "WORKER"), eq(users.status, "ACTIVE"))),
    db
      .select({ avg: sql<number | null>`round(avg(${activityLogs.responseAccuracy}))` })
      .from(activityLogs)
      .where(and(eq(activityLogs.farmId, farmId), gte(activityLogs.startedAt, monthStart), lt(activityLogs.startedAt, monthEnd))),
  ]);

  return {
    todaysRecordings: recs.n,
    newToday: newToday.n,
    activeWorkers: workers.n,
    responseAccuracy: accuracy.avg == null ? null : Number(accuracy.avg),
  };
}

/** Badge on the "Dashboard" nav item: logs that arrived today and are still unreviewed. */
export async function newLogsTodayCount(farmId: string, tz: string, now = new Date()) {
  const dayStart = startOfDay(now, tz);
  const [row] = await db
    .select({ n: count() })
    .from(activityLogs)
    .where(and(eq(activityLogs.farmId, farmId), eq(activityLogs.status, "NEW"), gte(activityLogs.createdAt, dayStart)));
  return row.n;
}

export async function listFields(farmId: string) {
  return db.select().from(fields).where(eq(fields.farmId, farmId)).orderBy(asc(fields.name));
}

export async function listTags(farmId: string) {
  return db.select({ id: tags.id, name: tags.name }).from(tags).where(eq(tags.farmId, farmId)).orderBy(asc(tags.name));
}

export async function listWorkers(farmId: string) {
  return db
    .select({ id: users.id, name: users.name, email: users.email, status: users.status, avatarUrl: users.avatarUrl })
    .from(users)
    .where(and(eq(users.farmId, farmId), eq(users.role, "WORKER")))
    .orderBy(asc(users.name));
}
