"use client";

import { Check, ChevronRight, Mic, Square } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { QUESTIONS } from "@/lib/voice-log";

/**
 * The worker-side "mobile app", in the browser.
 *
 * One MediaRecorder captures the whole session. For each guided question the
 * Web Speech API (where the browser has it) transcribes the answer live; the
 * worker can always fix the text before submitting. On submit the clip, the
 * answers and 120 waveform peaks (computed here with the Web Audio API so the
 * server never has to decode audio) go to POST /api/recordings.
 */

type Phase = "idle" | "recording" | "review" | "submitting" | "done" | "error";
type Worker = { id: string; name: string };

// Minimal typing for the (still vendor-prefixed) Web Speech API.
type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

function getRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

async function computePeaks(blob: Blob, count = 120): Promise<{ peaks: number[]; durationSec: number }> {
  try {
    const ctx = new AudioContext();
    const buf = await ctx.decodeAudioData(await blob.arrayBuffer());
    const data = buf.getChannelData(0);
    const bucket = Math.max(1, Math.floor(data.length / count));
    const peaks: number[] = [];
    for (let b = 0; b < count; b++) {
      let sum = 0;
      const start = b * bucket;
      const end = Math.min(data.length, start + bucket);
      for (let i = start; i < end; i++) sum += data[i] * data[i];
      peaks.push(end > start ? Math.sqrt(sum / (end - start)) : 0);
    }
    const max = Math.max(...peaks, 1e-6);
    void ctx.close();
    return { peaks: peaks.map((p) => Math.round((p / max) * 1000) / 1000), durationSec: Math.round(buf.duration * 10) / 10 };
  } catch {
    return { peaks: [], durationSec: 0 };
  }
}

export function Recorder({ workers, self }: { workers: Worker[]; self: Worker }) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [workerId, setWorkerId] = useState(self.id);
  const [qIndex, setQIndex] = useState(0);
  const [answers, setAnswers] = useState<string[]>(() => QUESTIONS.map(() => ""));
  const [interim, setInterim] = useState("");
  // null during server render / hydration, then the real answer.
  const speechSupported = useSyncExternalStore(
    () => () => {},
    () => Boolean(getRecognitionCtor()),
    () => null,
  );
  const [elapsed, setElapsed] = useState(0);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [result, setResult] = useState<{ activity: string; field: string | null; extraction: string; extractionError: string | null } | null>(null);

  const mediaRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const blobRef = useRef<Blob | null>(null);
  const recogRef = useRef<SpeechRecognitionLike | null>(null);
  const qIndexRef = useRef(0);
  const startedAtRef = useRef(0);
  const finalRef = useRef(""); // finalised speech for the current question

  useEffect(() => {
    if (phase !== "recording") return;
    const t = setInterval(() => setElapsed(Math.round((Date.now() - startedAtRef.current) / 1000)), 500);
    return () => clearInterval(t);
  }, [phase]);

  const stopRecognition = useCallback(() => {
    const r = recogRef.current;
    recogRef.current = null;
    if (r) {
      r.onend = null;
      r.onresult = null;
      try {
        r.stop();
      } catch {
        /* ignore */
      }
    }
  }, []);

  const startRecognition = useCallback(() => {
    const Ctor = getRecognitionCtor();
    if (!Ctor) return;
    stopRecognition();
    finalRef.current = "";
    setInterim("");
    const r = new Ctor();
    r.lang = "en-US";
    r.continuous = true;
    r.interimResults = true;
    r.onresult = (e) => {
      let interimText = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        const text = res[0].transcript;
        if (res.isFinal) finalRef.current = `${finalRef.current} ${text}`.trim();
        else interimText += text;
      }
      const idx = qIndexRef.current;
      setAnswers((prev) => prev.map((a, i) => (i === idx ? finalRef.current : a)));
      setInterim(interimText);
    };
    r.onerror = (e) => {
      if (e.error === "not-allowed") setError("Microphone access was blocked.");
    };
    // Chrome stops recognition after silence; keep it alive while a question is open.
    r.onend = () => {
      if (recogRef.current === r) {
        try {
          r.start();
        } catch {
          /* ignore */
        }
      }
    };
    recogRef.current = r;
    try {
      r.start();
    } catch {
      /* ignore */
    }
  }, [stopRecognition]);

  const start = async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"].find((m) => MediaRecorder.isTypeSupported(m));
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunksRef.current = [];
      rec.ondataavailable = (e) => e.data.size && chunksRef.current.push(e.data);
      rec.start(250);
      mediaRef.current = rec;
      startedAtRef.current = Date.now();
      setElapsed(0);
      setAnswers(QUESTIONS.map(() => ""));
      setQIndex(0);
      qIndexRef.current = 0;
      setPhase("recording");
      startRecognition();
    } catch {
      setError("Could not access the microphone. Check the browser permission and try again.");
      setPhase("error");
    }
  };

  const next = () => {
    if (qIndex < QUESTIONS.length - 1) {
      const n = qIndex + 1;
      setQIndex(n);
      qIndexRef.current = n;
      startRecognition();
    } else {
      finish();
    }
  };

  const finish = () => {
    stopRecognition();
    const rec = mediaRef.current;
    if (!rec) return;
    rec.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" });
      blobRef.current = blob;
      setAudioUrl(URL.createObjectURL(blob));
      streamRef.current?.getTracks().forEach((t) => t.stop());
      setPhase("review");
    };
    rec.stop();
  };

  const submit = async () => {
    const blob = blobRef.current;
    if (!blob) return;
    setPhase("submitting");
    setError(null);
    const { peaks, durationSec } = await computePeaks(blob);
    const form = new FormData();
    form.append("audio", blob, "recording.webm");
    form.append("answers", JSON.stringify(answers));
    form.append("peaks", JSON.stringify(peaks));
    form.append("durationSec", String(durationSec || elapsed));
    form.append("workerId", workerId);
    try {
      const res = await fetch("/api/recordings", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || `Upload failed (${res.status})`);
      setResult({ activity: data.activity, field: data.field, extraction: data.extraction, extractionError: data.extractionError ?? null });
      setPhase("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
      setPhase("review");
    }
  };

  const reset = () => {
    stopRecognition();
    setPhase("idle");
    setAnswers(QUESTIONS.map(() => ""));
    setQIndex(0);
    qIndexRef.current = 0;
    setAudioUrl(null);
    blobRef.current = null;
    setResult(null);
    setError(null);
  };

  const mm = String(Math.floor(elapsed / 60));
  const ss = String(elapsed % 60).padStart(2, "0");

  return (
    <div className="mx-auto w-full max-w-[440px]">
      {phase === "idle" || phase === "error" ? (
        <div className="rounded-[14px] border border-line bg-surface p-5">
          <h2 className="text-[15px] font-semibold text-ink">New voice log</h2>
          <p className="mt-1 text-[12px] leading-4 text-muted">
            Toph will ask {QUESTIONS.length} short questions. Answer out loud; you can fix the text before it&rsquo;s filed.
          </p>
          {workers.length > 1 && (
            <label className="mt-4 block">
              <span className="mb-1.5 block text-[12px] font-medium text-muted">Logging for</span>
              <select
                value={workerId}
                onChange={(e) => setWorkerId(e.target.value)}
                className="h-10 w-full rounded-[8px] border border-line bg-surface px-3 text-[14px] outline-none focus:border-ink"
              >
                {workers.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {speechSupported === false && (
            <p className="mt-3 rounded-[8px] bg-row-hover px-3 py-2 text-[12px] text-ink-2">
              This browser can&rsquo;t transcribe speech live, so the audio will still be recorded and you can type each answer. Chrome or Safari
              transcribe automatically.
            </p>
          )}
          {error && <p className="mt-3 text-[12px] text-[#c62828]">{error}</p>}
          <button
            type="button"
            onClick={start}
            className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-[10px] bg-chip text-[14px] font-medium text-chip-ink hover:bg-black"
          >
            <Mic size={16} strokeWidth={2} aria-hidden />
            Start recording
          </button>
        </div>
      ) : null}

      {phase === "recording" && (
        <div className="rounded-[14px] border border-line bg-surface p-5">
          <div className="flex items-center justify-between text-[12px] text-muted">
            <span className="flex items-center gap-1.5">
              <span className="size-2 animate-pulse rounded-full bg-[#e53935]" aria-hidden />
              Recording {mm}:{ss}
            </span>
            <span>
              Question {qIndex + 1} of {QUESTIONS.length}
            </span>
          </div>
          <p className="mt-4 text-[16px] leading-6 font-medium text-ink">{QUESTIONS[qIndex].text}</p>
          {/* Always editable: speech results land here, and the worker can correct or type instead. */}
          <div className="mt-4 rounded-[8px] bg-row-hover p-3 text-[13px] leading-5 text-ink-2">
            <textarea
              value={answers[qIndex]}
              onChange={(e) => {
                finalRef.current = e.target.value;
                setAnswers((prev) => prev.map((a, i) => (i === qIndex ? e.target.value : a)));
              }}
              placeholder={speechSupported ? "Listening… (or type your answer)" : "Type your answer…"}
              rows={3}
              className="w-full resize-none bg-transparent outline-none placeholder:text-muted-2"
            />
            {interim && <p className="mt-1 text-muted">{interim}</p>}
          </div>
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={finish}
              className="flex h-11 items-center gap-1.5 rounded-[10px] border border-line px-4 text-[13px] font-medium text-ink hover:bg-row-hover"
            >
              <Square size={14} strokeWidth={2} aria-hidden />
              Stop
            </button>
            <button
              type="button"
              onClick={next}
              className="flex h-11 flex-1 items-center justify-center gap-1.5 rounded-[10px] bg-chip text-[13px] font-medium text-chip-ink hover:bg-black"
            >
              {qIndex < QUESTIONS.length - 1 ? "Next question" : "Finish"}
              <ChevronRight size={15} strokeWidth={2} aria-hidden />
            </button>
          </div>
        </div>
      )}

      {(phase === "review" || phase === "submitting") && (
        <div className="rounded-[14px] border border-line bg-surface p-5">
          <h2 className="text-[15px] font-semibold text-ink">Review before filing</h2>
          {audioUrl && <audio controls src={audioUrl} className="mt-3 w-full" />}
          <ol className="mt-4 space-y-3">
            {QUESTIONS.map((q, i) => (
              <li key={q.key}>
                <span className="block text-[11px] leading-4 text-muted">{q.text}</span>
                <textarea
                  value={answers[i]}
                  onChange={(e) => setAnswers((prev) => prev.map((a, j) => (j === i ? e.target.value : a)))}
                  rows={2}
                  className="mt-1 w-full resize-none rounded-[8px] border border-line bg-surface px-3 py-2 text-[13px] leading-5 outline-none focus:border-ink"
                />
              </li>
            ))}
          </ol>
          {error && <p className="mt-3 text-[12px] text-[#c62828]">{error}</p>}
          <div className="mt-4 flex gap-2">
            <button type="button" onClick={reset} disabled={phase === "submitting"} className="h-11 rounded-[10px] border border-line px-4 text-[13px] font-medium text-ink hover:bg-row-hover disabled:opacity-60">
              Discard
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={phase === "submitting"}
              className="flex h-11 flex-1 items-center justify-center gap-1.5 rounded-[10px] bg-chip text-[13px] font-medium text-chip-ink hover:bg-black disabled:opacity-60"
            >
              {phase === "submitting" ? "Filing…" : "File this log"}
            </button>
          </div>
        </div>
      )}

      {phase === "done" && result && (
        <div className="rounded-[14px] border border-line bg-surface p-5 text-center">
          <span className="mx-auto grid size-12 place-items-center rounded-full bg-green-soft text-green-ink">
            <Check size={22} strokeWidth={2.5} aria-hidden />
          </span>
          <h2 className="mt-3 text-[15px] font-semibold text-ink">Log filed</h2>
          <p className="mt-1 text-[12px] leading-4 text-muted">
            Extracted as <span className="font-medium text-ink">{result.activity.replace("_", " ").toLowerCase()}</span>
            {result.field ? (
              <>
                {" "}
                on <span className="font-medium text-ink">{result.field}</span>
              </>
            ) : null}{" "}
            ({result.extraction === "claude" ? "Claude" : "keyword heuristic"}). It&rsquo;s waiting for review on the dashboard.
          </p>
          {result.extractionError && (
            <p className="mt-2 rounded-[8px] bg-row-hover px-3 py-2 text-left text-[12px] leading-4 text-muted">
              Claude couldn&rsquo;t be used for this one: {result.extractionError}
            </p>
          )}
          <div className="mt-5 flex gap-2">
            <button type="button" onClick={reset} className="h-11 flex-1 rounded-[10px] border border-line text-[13px] font-medium text-ink hover:bg-row-hover">
              Record another
            </button>
            <Link href="/dashboard" className="flex h-11 flex-1 items-center justify-center rounded-[10px] bg-chip text-[13px] font-medium text-chip-ink hover:bg-black">
              Open dashboard
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
