/**
 * Seeds the database with the Bays Ranch demo dataset.
 *
 *   npm run db:seed
 *
 * Idempotent: it wipes any existing "Bays Ranch" farm first, so it can be
 * re-run to reset the demo. Dates are relative to today in the farm's
 * timezone so the dashboard always shows live-looking numbers.
 */
import "dotenv/config";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { readFileSync } from "node:fs";
import path from "node:path";
import { Pool } from "pg";
import { addDays, fromParts, startOfMonth, toParts } from "../lib/time";
import * as schema from "./schema";
import {
  ADMIN,
  ALL_LOGS,
  DESIGN_TRANSCRIPT_PREFIX,
  FAILED_RECORDING,
  FARM,
  FIELDS,
  QUESTIONS,
  TAGS,
  WORKERS,
  buildTranscript,
} from "./seed-data";

type Peaks = Record<string, { durationSec: number; peaks: number[] }>;

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const pool = new Pool({ connectionString: url });
  const db = drizzle(pool, { schema });
  // Make sure the tables exist — lets a fresh database be seeded in one step.
  await migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
  const peaks: Peaks = JSON.parse(readFileSync(path.join(process.cwd(), "public/audio/peaks.json"), "utf8"));
  const tz = FARM.timezone;
  const now = new Date();
  const today = toParts(now, tz);

  // ── wipe + farm ────────────────────────────────────────────────────────
  await db.delete(schema.farms).where(eq(schema.farms.name, FARM.name));
  const [farm] = await db.insert(schema.farms).values({ name: FARM.name, timezone: tz }).returning();

  // ── people ─────────────────────────────────────────────────────────────
  const [admin] = await db
    .insert(schema.users)
    .values({
      farmId: farm.id,
      name: ADMIN.name,
      email: ADMIN.email,
      passwordHash: bcrypt.hashSync(ADMIN.password, 10),
      role: "ADMIN",
      avatarUrl: ADMIN.avatarUrl,
    })
    .returning();

  const workerRows = await db
    .insert(schema.users)
    .values(
      WORKERS.map((w) => ({
        farmId: farm.id,
        name: w.name,
        email: w.email,
        role: "WORKER" as const,
        status: w.status ?? ("ACTIVE" as const),
        // Workers can log in too (same demo password) so "Switch User" has somewhere to go.
        passwordHash: bcrypt.hashSync(ADMIN.password, 10),
      })),
    )
    .returning();
  const workerByName = new Map(workerRows.map((w) => [w.name, w]));

  // ── land ───────────────────────────────────────────────────────────────
  const fieldRows = await db
    .insert(schema.fields)
    .values(FIELDS.map((f) => ({ ...f, farmId: farm.id })))
    .returning();
  const fieldByName = new Map(fieldRows.map((f) => [f.name, f]));

  // ── tags ───────────────────────────────────────────────────────────────
  const tagRows = await db
    .insert(schema.tags)
    .values(TAGS.map((name) => ({ farmId: farm.id, name })))
    .returning();
  const tagByName = new Map(tagRows.map((t) => [t.name, t]));

  // ── recordings + logs ──────────────────────────────────────────────────
  const monthStart = startOfMonth(now, tz);
  // NEW logs sit on the last four days; keep them inside the current month even on the 1st–3rd.
  const dayFor = (daysAgo: number) => {
    const effective = daysAgo <= 3 ? Math.min(daysAgo, today.day - 1) : daysAgo;
    return toParts(addDays(now, -Math.max(0, effective), tz), tz);
  };

  const at = (d: { year: number; month: number; day: number }, hm: string) => {
    const [hour, minute] = hm.split(":").map(Number);
    return fromParts({ ...d, hour, minute }, tz);
  };

  let inserted = 0;
  for (const log of ALL_LOGS) {
    const worker = workerByName.get(log.worker);
    if (!worker) throw new Error(`unknown worker ${log.worker}`);
    const d = dayFor(log.daysAgo);
    const startedAt = at(d, log.start);
    const endedAt = at(d, log.end);
    // Workers record right after finishing the task.
    const capturedAt = new Date(endedAt.getTime() + 4 * 60_000);
    const clip = peaks[log.key];
    if (!clip) throw new Error(`no audio for ${log.key} — run: npx tsx scripts/gen-audio.ts`);

    const transcript = log.transcript
      ? `${DESIGN_TRANSCRIPT_PREFIX}${capturedAt.toISOString()}. ${log.transcript}`
      : buildTranscript(capturedAt.toISOString(), log.answers);

    // Everything in the current month averages to exactly 90 (see seed-data.ts).
    const accuracy = log.key.startsWith("hist-") && startedAt >= monthStart ? 90 : log.responseAccuracy;

    const [rec] = await db
      .insert(schema.recordings)
      .values({
        farmId: farm.id,
        workerId: worker.id,
        capturedAt,
        durationSec: clip.durationSec,
        mimeType: "audio/mpeg",
        audioUrl: `/audio/${log.key}.mp3`,
        waveform: clip.peaks,
        transcript,
        status: "PROCESSED",
        source: "SEED",
        createdAt: capturedAt,
      })
      .returning();

    const reviewed = log.status !== "NEW";
    const reviewedAt = reviewed ? new Date(capturedAt.getTime() + 3 * 3600_000) : null;
    const [row] = await db
      .insert(schema.activityLogs)
      .values({
        farmId: farm.id,
        recordingId: rec.id,
        workerId: worker.id,
        fieldId: log.field ? (fieldByName.get(log.field)?.id ?? null) : null,
        activity: log.activity,
        startedAt,
        endedAt,
        product: log.product ?? null,
        quantity: log.quantity ?? null,
        unit: log.unit ?? null,
        summary: transcript,
        responseAccuracy: accuracy,
        status: log.status,
        reviewedAt,
        reviewedById: reviewed ? admin.id : null,
        createdAt: new Date(capturedAt.getTime() + 20_000),
        updatedAt: reviewedAt ?? new Date(capturedAt.getTime() + 20_000),
      })
      .returning();

    for (const tagName of log.tags ?? []) {
      const tag = tagByName.get(tagName);
      if (tag) {
        await db.insert(schema.logTags).values({ logId: row.id, tagId: tag.id, createdById: admin.id, createdAt: reviewedAt ?? capturedAt });
      }
    }
    if (reviewed) {
      await db.insert(schema.auditEvents).values({
        farmId: farm.id,
        actorId: admin.id,
        action: log.status === "FLAGGED" ? "log.flagged" : "log.reviewed",
        entityType: "activity_log",
        entityId: row.id,
        meta: { worker: worker.name, activity: log.activity },
        createdAt: reviewedAt!,
      });
    }
    inserted++;
  }

  // A recording that could not be transcribed: counts as a recording, has no log.
  {
    const worker = workerByName.get(FAILED_RECORDING.worker)!;
    const d = toParts(addDays(now, -FAILED_RECORDING.daysAgo, tz), tz);
    const capturedAt = at(d, FAILED_RECORDING.time);
    const clip = peaks[FAILED_RECORDING.key];
    await db.insert(schema.recordings).values({
      farmId: farm.id,
      workerId: worker.id,
      capturedAt,
      durationSec: clip.durationSec,
      audioUrl: `/audio/${FAILED_RECORDING.key}.mp3`,
      waveform: clip.peaks,
      transcript: FAILED_RECORDING.transcript,
      status: "FAILED",
      source: "SEED",
      createdAt: capturedAt,
    });
  }

  await db.insert(schema.auditEvents).values({
    farmId: farm.id,
    actorId: admin.id,
    action: "seed.completed",
    entityType: "farm",
    entityId: farm.id,
    meta: { logs: inserted, questions: QUESTIONS.length },
  });

  console.log(`Seeded ${FARM.name}: ${WORKERS.length} workers, ${FIELDS.length} fields, ${inserted} logs.`);
  console.log(`Login: ${ADMIN.email} / ${ADMIN.password}`);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
