/**
 * Synthesises the demo voice clips referenced by the seed data.
 *
 *   npx tsx scripts/gen-audio.ts
 *
 * Requires (Debian/Ubuntu): ffmpeg, espeak-ng + mbrola-us1/us2/us3, festival +
 * festvox-us-slt-hts. The generated MP3s and `peaks.json` are committed to the
 * repo, so nobody else ever needs these tools — `npm run db:seed` just reads them.
 *
 * Output: public/audio/<key>.mp3 and public/audio/peaks.json
 *   { [key]: { durationSec: number, peaks: number[] } }   // peaks: 0..1, 120 samples
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { ALL_LOGS, FAILED_RECORDING, WORKERS } from "../src/db/seed-data";

const OUT_DIR = path.join(process.cwd(), "public", "audio");
const PEAK_COUNT = 120;
const GAP_SECONDS = 0.9;

type VoiceId = "f1" | "f2" | "m1" | "m2" | "m3";

function synth(voice: VoiceId, text: string, outWav: string) {
  switch (voice) {
    case "f1": // Festival HTS voice (most natural of the free voices)
      execFileSync("text2wave", ["-eval", "(voice_cmu_us_slt_arctic_hts)", "-o", outWav], { input: text });
      return;
    case "f2":
      execFileSync("espeak-ng", ["-v", "mb-us1", "-s", "150", "-w", outWav, text]);
      return;
    case "m1":
      execFileSync("espeak-ng", ["-v", "mb-us2", "-s", "145", "-w", outWav, text]);
      return;
    case "m2":
      execFileSync("espeak-ng", ["-v", "mb-us3", "-s", "150", "-w", outWav, text]);
      return;
    case "m3":
      execFileSync("espeak-ng", ["-v", "mb-us2", "-s", "135", "-p", "35", "-w", outWav, text]);
      return;
  }
}

/** Concatenate answer clips with silence between them, normalise, encode to MP3. */
function buildClip(key: string, voice: VoiceId, answers: string[]) {
  const work = mkdtempSync(path.join(tmpdir(), "toph-audio-"));
  try {
    const parts: string[] = [];
    answers.forEach((answer, i) => {
      const wav = path.join(work, `part-${i}.wav`);
      synth(voice, answer, wav);
      parts.push(wav);
    });
    // ffmpeg concat with a silent gap between parts, resample to 22.05 kHz mono.
    const inputs = parts.flatMap((p) => ["-i", p]);
    const filter =
      parts
        .map((_, i) => `[${i}:a]aresample=22050,aformat=channel_layouts=mono,apad=pad_dur=${GAP_SECONDS}[a${i}]`)
        .join(";") +
      ";" +
      parts.map((_, i) => `[a${i}]`).join("") +
      `concat=n=${parts.length}:v=0:a=1,loudnorm=I=-18:TP=-2[out]`;
    const mp3 = path.join(OUT_DIR, `${key}.mp3`);
    execFileSync("ffmpeg", [
      "-y",
      "-hide_banner",
      "-loglevel",
      "error",
      ...inputs,
      "-filter_complex",
      filter,
      "-map",
      "[out]",
      "-codec:a",
      "libmp3lame",
      "-b:a",
      "48k",
      mp3,
    ]);
    return mp3;
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

/** Decode to 8 kHz 16-bit PCM and reduce to PEAK_COUNT normalised RMS buckets. */
function analyse(mp3: string) {
  const pcm = execFileSync("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-i",
    mp3,
    "-f",
    "s16le",
    "-ac",
    "1",
    "-ar",
    "8000",
    "-",
  ]);
  const samples = new Int16Array(pcm.buffer, pcm.byteOffset, Math.floor(pcm.byteLength / 2));
  const durationSec = samples.length / 8000;
  const bucket = Math.max(1, Math.floor(samples.length / PEAK_COUNT));
  const peaks: number[] = [];
  for (let b = 0; b < PEAK_COUNT; b++) {
    let sum = 0;
    const start = b * bucket;
    const end = Math.min(samples.length, start + bucket);
    for (let i = start; i < end; i++) sum += samples[i] * samples[i];
    const rms = end > start ? Math.sqrt(sum / (end - start)) / 32768 : 0;
    peaks.push(rms);
  }
  const max = Math.max(...peaks, 1e-6);
  return { durationSec: Math.round(durationSec * 10) / 10, peaks: peaks.map((p) => Math.round((p / max) * 1000) / 1000) };
}

function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const voiceOf = new Map(WORKERS.map((w) => [w.name, w.voice as VoiceId]));
  const manifest: Record<string, { durationSec: number; peaks: number[] }> = {};

  const jobs: { key: string; voice: VoiceId; answers: string[] }[] = [
    ...ALL_LOGS.map((l) => ({ key: l.key, voice: voiceOf.get(l.worker) ?? "m1", answers: l.answers })),
    { key: FAILED_RECORDING.key, voice: voiceOf.get(FAILED_RECORDING.worker) ?? "f2", answers: FAILED_RECORDING.answers },
  ];

  for (const job of jobs) {
    const mp3 = buildClip(job.key, job.voice, job.answers);
    manifest[job.key] = analyse(mp3);
    console.log(`${job.key}: ${manifest[job.key].durationSec}s`);
  }
  writeFileSync(path.join(OUT_DIR, "peaks.json"), JSON.stringify(manifest));
  console.log(`\nWrote ${jobs.length} clips + peaks.json to ${OUT_DIR}`);
}

main();
