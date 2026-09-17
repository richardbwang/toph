import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/db";
import { activityLogs, auditEvents, fields, recordings, users } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";
import { extractLog } from "@/lib/extract";
import { QUESTIONS, buildTranscript } from "@/lib/voice-log";

export const maxDuration = 60;

const MAX_AUDIO_BYTES = 8 * 1024 * 1024;

/**
 * POST /api/recordings — ingest a guided voice log.
 *
 * This is the endpoint the mobile app would call. The web /record page uses
 * it too. multipart/form-data:
 *   audio       Blob (audio/webm, audio/mp4, audio/wav …)
 *   answers     JSON string[] — one entry per guided question
 *   peaks       JSON number[] — 120 normalised waveform peaks (client-computed)
 *   durationSec number
 *   workerId    optional: an admin may file a log on a worker's behalf
 *
 * Pipeline: store the raw recording → extract a structured log → mark NEW.
 * If extraction fails the recording is kept with status FAILED so nothing a
 * worker said is ever lost.
 */
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const form = await req.formData();
  const audio = form.get("audio");
  if (!(audio instanceof Blob) || audio.size === 0) return NextResponse.json({ error: "Missing audio" }, { status: 400 });
  if (audio.size > MAX_AUDIO_BYTES) return NextResponse.json({ error: "Recording too large (max 8 MB)" }, { status: 413 });

  let answers: string[] = [];
  let peaks: number[] = [];
  try {
    answers = JSON.parse(String(form.get("answers") ?? "[]"));
    peaks = JSON.parse(String(form.get("peaks") ?? "[]"));
  } catch {
    return NextResponse.json({ error: "Bad answers/peaks JSON" }, { status: 400 });
  }
  if (!Array.isArray(answers) || answers.length !== QUESTIONS.length) {
    return NextResponse.json({ error: `Expected ${QUESTIONS.length} answers` }, { status: 400 });
  }
  peaks = Array.isArray(peaks) ? peaks.slice(0, 200).map((p) => Math.max(0, Math.min(1, Number(p) || 0))) : [];
  const durationSec = Math.max(0, Number(form.get("durationSec")) || 0);

  // Who is this log about? Workers file for themselves; admins may pick a worker.
  let workerId = user.id;
  const requested = String(form.get("workerId") ?? "");
  if (requested && requested !== user.id) {
    if (user.role !== "ADMIN") return NextResponse.json({ error: "Only admins can file for someone else" }, { status: 403 });
    const [w] = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.id, requested), eq(users.farmId, user.farm.id)));
    if (!w) return NextResponse.json({ error: "Unknown worker" }, { status: 400 });
    workerId = w.id;
  }

  const capturedAt = new Date();
  const transcript = buildTranscript(capturedAt.toISOString(), answers.map((a) => String(a ?? "")));
  const audioData = Buffer.from(await audio.arrayBuffer());

  const [rec] = await db
    .insert(recordings)
    .values({
      farmId: user.farm.id,
      workerId,
      capturedAt,
      durationSec,
      mimeType: audio.type || "audio/webm",
      audioData,
      waveform: peaks,
      transcript,
      status: "PROCESSING",
      source: "WEB",
    })
    .returning({ id: recordings.id });

  const farmFields = await db.select({ id: fields.id, name: fields.name }).from(fields).where(eq(fields.farmId, user.farm.id));

  try {
    const extracted = await extractLog({
      answers: QUESTIONS.map((q, i) => ({ key: q.key, question: q.text, answer: String(answers[i] ?? "") })),
      capturedAt,
      timezone: user.farm.timezone,
      fieldNames: farmFields.map((f) => f.name),
      transcript,
    });
    const field = extracted.fieldName ? farmFields.find((f) => f.name === extracted.fieldName) : null;

    const [log] = await db
      .insert(activityLogs)
      .values({
        farmId: user.farm.id,
        recordingId: rec.id,
        workerId,
        fieldId: field?.id ?? null,
        activity: extracted.activity,
        startedAt: extracted.startedAt,
        endedAt: extracted.endedAt,
        product: extracted.product,
        quantity: extracted.quantity,
        unit: extracted.unit,
        summary: extracted.summary,
        responseAccuracy: extracted.responseAccuracy,
        status: "NEW",
      })
      .returning({ id: activityLogs.id });

    await db.update(recordings).set({ status: "PROCESSED" }).where(eq(recordings.id, rec.id));
    await db.insert(auditEvents).values({
      farmId: user.farm.id,
      actorId: user.id,
      action: "recording.ingested",
      entityType: "activity_log",
      entityId: log.id,
      meta: { recordingId: rec.id, extraction: extracted.method, durationSec },
    });
    revalidatePath("/", "layout");
    return NextResponse.json({ ok: true, recordingId: rec.id, logId: log.id, extraction: extracted.method, activity: extracted.activity, field: field?.name ?? null });
  } catch (err) {
    console.error("extraction failed", err);
    await db.update(recordings).set({ status: "FAILED" }).where(eq(recordings.id, rec.id));
    revalidatePath("/", "layout");
    return NextResponse.json({ ok: false, recordingId: rec.id, error: "Recording saved, but it could not be turned into a log." }, { status: 502 });
  }
}
