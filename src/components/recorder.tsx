"use client";

import { Check, ChevronRight, Ear, Mic, Square, Volume2 } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { QUESTIONS } from "@/lib/voice-log";

/**
 * The worker-side "mobile app", in the browser — hands-free after one tap.
 *
 * The brief: workers "record audio recordings hands-free". So after the tap
 * that opens the microphone (browsers require a gesture for that, and for
 * speech output), the phone runs the guided log itself:
 *
 *   ask ──▶ listen ──▶ (pause or "next") ──▶ ask ──▶ … ──▶ file
 *
 * - **Ask**: the question is read aloud with the browser's speech synthesis.
 *   Transcription and the recording are *paused* while it speaks, so the app
 *   never transcribes its own voice and the manager's playback contains only
 *   the worker.
 * - **Listen**: the Web Speech API transcribes live into an editable field.
 *   The worker moves on by pausing for a few seconds after answering, or by
 *   saying "next" (also "done", "skip"). Silence with no answer at all moves
 *   on after a longer wait, so the flow never stalls.
 * - **File**: after the last answer the log is filed automatically, with a
 *   short countdown the worker can interrupt to fix a transcription.
 *
 * One MediaRecorder captures the whole session; 120 waveform peaks are
 * computed here with the Web Audio API so the server never decodes audio.
 * Browsers without speech recognition fall back to tapping and typing, and a
 * "Hands-free" switch turns the automation off on any browser.
 */

type Phase = "idle" | "recording" | "review" | "submitting" | "done" | "error";
type Stage = "asking" | "listening";
type Worker = { id: string; name: string };

const SILENCE_MS = 3000; // quiet after an answer → next question
const NO_ANSWER_MS = 12_000; // nothing said at all → move on anyway
const FILE_COUNTDOWN_S = 5;
const ECHO_GUARD_MS = 250; // let the speaker's tail die before the mic listens again

/** A final transcript segment that is only a command, e.g. the worker pauses and says "next". */
const COMMAND = /^(?:ok(?:ay)?[,.]?\s+)?(?:next(?: question)?|done|skip(?: it| this)?|that'?s (?:it|all)|go on|continue)[.!?]*$/i;

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

function getSynth(): SpeechSynthesis | null {
  if (typeof window === "undefined") return null;
  return "speechSynthesis" in window && "SpeechSynthesisUtterance" in window ? window.speechSynthesis : null;
}

/**
 * Speaks `text` and resolves when it is over. Never hangs: a browser with no
 * voices installed (or a headless one) may never fire `onend`, so a timer
 * sized to the text length settles the promise regardless.
 */
function speak(text: string): Promise<void> {
  return new Promise((resolve) => {
    const synth = getSynth();
    if (!synth) return resolve();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "en-US";
    u.rate = 1.05;
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      clearTimeout(guard);
      resolve();
    };
    u.onend = done;
    u.onerror = done;
    const guard = setTimeout(done, 2000 + text.length * 90);
    if (synth.speaking || synth.pending) synth.cancel();
    // Chrome drops an utterance queued in the same tick as cancel().
    setTimeout(() => synth.speak(u), 60);
  });
}

/** iOS only starts speech synthesis inside a user gesture; a silent utterance in the tap handler unlocks it for the session. */
function unlockSpeech() {
  const synth = getSynth();
  if (!synth) return;
  try {
    const u = new SpeechSynthesisUtterance(" ");
    u.volume = 0;
    synth.speak(u);
  } catch {
    /* ignore */
  }
}

function silence() {
  try {
    getSynth()?.cancel();
  } catch {
    /* ignore */
  }
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
  const [stage, setStage] = useState<Stage>("listening");
  const [error, setError] = useState<string | null>(null);
  const [workerId, setWorkerId] = useState(self.id);
  const [handsFree, setHandsFree] = useState(true);
  const [auto, setAuto] = useState(false); // hands-free in effect for this session (render copy of autoRef)
  const [qIndex, setQIndex] = useState(0);
  const [answers, setAnswers] = useState<string[]>(() => QUESTIONS.map(() => ""));
  const [interim, setInterim] = useState("");
  const [countdown, setCountdown] = useState<number | null>(null);
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
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const qIndexRef = useRef(0);
  const startedAtRef = useRef(0);
  const finalRef = useRef(""); // finalised speech for the current question
  const interimRef = useRef("");
  const lastHeardRef = useRef(0); // last time the recogniser reported anything
  const listeningSinceRef = useRef(0);
  const watchRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const genRef = useRef(0); // bumps on every transition; stale async work checks it
  const autoRef = useRef(false); // hands-free actually in effect for this session
  const advanceRef = useRef<(reason: "tap" | "command" | "silence" | "no-answer") => void>(() => {});
  const submitRef = useRef<() => Promise<void>>(async () => {});

  useEffect(() => {
    if (phase !== "recording") return;
    const t = setInterval(() => setElapsed(Math.round((Date.now() - startedAtRef.current) / 1000)), 500);
    return () => clearInterval(t);
  }, [phase]);

  // Auto-file countdown on the review screen (hands-free only).
  useEffect(() => {
    if (countdown === null || phase !== "review") return;
    const t = setTimeout(() => {
      if (countdown <= 1) {
        setCountdown(null);
        void submitRef.current();
      } else {
        setCountdown(countdown - 1);
      }
    }, 1000);
    return () => clearTimeout(t);
  }, [countdown, phase]);

  const stopWatch = () => {
    if (watchRef.current) clearInterval(watchRef.current);
    watchRef.current = null;
  };

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
    interimRef.current = "";
    setInterim("");
    const r = new Ctor();
    r.lang = "en-US";
    r.continuous = true;
    r.interimResults = true;
    r.onresult = (e) => {
      let interimText = "";
      let lastFinal: string | null = null;
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        const text = res[0].transcript;
        if (res.isFinal) {
          finalRef.current = `${finalRef.current} ${text}`.trim();
          lastFinal = text.trim();
        } else {
          interimText += text;
        }
      }
      lastHeardRef.current = Date.now();
      interimRef.current = interimText;

      // A segment that is only "next" / "done" / "skip" is a command, not an answer.
      const command = autoRef.current && lastFinal !== null && COMMAND.test(lastFinal);
      if (command && lastFinal) finalRef.current = finalRef.current.slice(0, -lastFinal.length).trim();

      const idx = qIndexRef.current;
      setAnswers((prev) => prev.map((a, i) => (i === idx ? finalRef.current : a)));
      setInterim(command ? "" : interimText);
      if (command) advanceRef.current("command");
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

  const pauseRecorder = () => {
    try {
      if (mediaRef.current?.state === "recording") mediaRef.current.pause();
    } catch {
      /* ignore */
    }
  };
  const resumeRecorder = () => {
    try {
      if (mediaRef.current?.state === "paused") mediaRef.current.resume();
    } catch {
      /* ignore */
    }
  };

  /** Moves to question `index`: read it aloud (hands-free), then listen. */
  const askQuestion = useCallback(
    async (index: number, preface = "") => {
      const gen = ++genRef.current;
      qIndexRef.current = index;
      setQIndex(index);
      stopWatch();
      stopRecognition();
      setInterim("");

      if (autoRef.current) {
        setStage("asking");
        pauseRecorder(); // the manager should hear the worker, not the phone
        await speak(preface + QUESTIONS[index].text);
        if (gen !== genRef.current) return; // the worker moved on meanwhile
        await new Promise((r) => setTimeout(r, ECHO_GUARD_MS));
        if (gen !== genRef.current) return;
        resumeRecorder();
      }

      setStage("listening");
      listeningSinceRef.current = Date.now();
      lastHeardRef.current = 0;
      startRecognition();

      if (autoRef.current) {
        watchRef.current = setInterval(() => {
          if (gen !== genRef.current) return stopWatch();
          const now = Date.now();
          const quietFor = now - Math.max(lastHeardRef.current, listeningSinceRef.current);
          const answered = finalRef.current.trim().length > 0;
          if (answered && !interimRef.current && quietFor >= SILENCE_MS) advanceRef.current("silence");
          else if (!answered && quietFor >= NO_ANSWER_MS) advanceRef.current("no-answer");
        }, 250);
      }
    },
    [startRecognition, stopRecognition],
  );

  const finish = useCallback(
    (autoFile: boolean) => {
      genRef.current++;
      stopWatch();
      stopRecognition();
      silence();
      const rec = mediaRef.current;
      if (!rec) return;
      rec.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" });
        blobRef.current = blob;
        setAudioUrl(URL.createObjectURL(blob));
        streamRef.current?.getTracks().forEach((t) => t.stop());
        setPhase("review");
        if (autoFile) {
          setCountdown(FILE_COUNTDOWN_S);
          void speak("All done. Filing your log.");
        }
      };
      rec.stop();
    },
    [stopRecognition],
  );

  const advance = useCallback(
    (reason: "tap" | "command" | "silence" | "no-answer") => {
      const idx = qIndexRef.current;
      if (idx < QUESTIONS.length - 1) {
        void askQuestion(idx + 1, reason === "no-answer" ? "No answer — moving on. " : "");
      } else {
        finish(autoRef.current && reason !== "tap");
      }
    },
    [askQuestion, finish],
  );
  const start = async () => {
    setError(null);
    autoRef.current = handsFree && Boolean(getRecognitionCtor());
    setAuto(autoRef.current);
    if (autoRef.current) unlockSpeech(); // must happen inside the tap, before any await
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
      setCountdown(null);
      setPhase("recording");
      // Keep the screen on for a hands-free log; not fatal if the browser refuses.
      try {
        wakeLockRef.current = (await navigator.wakeLock?.request("screen")) ?? null;
      } catch {
        wakeLockRef.current = null;
      }
      void askQuestion(0);
    } catch {
      setError("Could not access the microphone. Check the browser permission and try again.");
      setPhase("error");
    }
  };

  const releaseWakeLock = () => {
    void wakeLockRef.current?.release().catch(() => {});
    wakeLockRef.current = null;
  };

  const submit = async () => {
    const blob = blobRef.current;
    if (!blob) return;
    setCountdown(null);
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
      releaseWakeLock();
      if (autoRef.current) {
        const activity = String(data.activity ?? "").replace(/_/g, " ").toLowerCase();
        void speak(`Filed as ${activity}${data.field ? ` on ${data.field}` : ""}.`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
      setPhase("review");
    }
  };
  // Callbacks used from timers and recogniser events always see the latest closures.
  useEffect(() => {
    advanceRef.current = advance;
    submitRef.current = submit;
  });

  const reset = () => {
    genRef.current++;
    stopWatch();
    stopRecognition();
    silence();
    releaseWakeLock();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    setPhase("idle");
    setStage("listening");
    setAnswers(QUESTIONS.map(() => ""));
    setQIndex(0);
    qIndexRef.current = 0;
    setAudioUrl(null);
    setCountdown(null);
    blobRef.current = null;
    setResult(null);
    setError(null);
  };

  // Leaving the page mid-log: stop the microphone and the voice.
  useEffect(() => {
    const refs = { gen: genRef, watch: watchRef, stream: streamRef, lock: wakeLockRef };
    return () => {
      refs.gen.current++;
      if (refs.watch.current) clearInterval(refs.watch.current);
      stopRecognition();
      silence();
      refs.stream.current?.getTracks().forEach((t) => t.stop());
      void refs.lock.current?.release().catch(() => {});
    };
  }, [stopRecognition]);

  const cancelAutoFile = () => setCountdown(null);

  const mm = String(Math.floor(elapsed / 60));
  const ss = String(elapsed % 60).padStart(2, "0");

  return (
    <div className="mx-auto w-full max-w-[440px]">
      {phase === "idle" || phase === "error" ? (
        <div className="rounded-[14px] border border-line bg-surface p-5">
          <h2 className="text-[15px] font-semibold text-ink">New voice log</h2>
          <p className="mt-1 text-[12px] leading-4 text-muted">
            One tap to start. Toph asks {QUESTIONS.length} short questions out loud and files the log when you&rsquo;re done.
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
          {speechSupported && (
            <label className="mt-4 flex items-start gap-3 rounded-[10px] border border-line px-3 py-2.5">
              <input type="checkbox" checked={handsFree} onChange={(e) => setHandsFree(e.target.checked)} className="mt-0.5 size-4 accent-[#003930]" />
              <span>
                <span className="block text-[13px] font-medium text-ink">Hands-free</span>
                <span className="block text-[12px] leading-4 text-muted">
                  Each question is read aloud. Answer, then pause — or say &ldquo;next&rdquo; — to continue. The log is filed automatically at the end.
                </span>
              </span>
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
          {auto && (
            <p className="mt-2 flex items-center gap-1.5 text-[12px] text-muted" aria-live="polite">
              {stage === "asking" ? (
                <>
                  <Volume2 size={14} strokeWidth={2} aria-hidden /> Reading the question…
                </>
              ) : (
                <>
                  <Ear size={14} strokeWidth={2} aria-hidden /> Listening — pause, or say &ldquo;next&rdquo;, to continue
                </>
              )}
            </p>
          )}
          {/* Always editable: speech results land here, and the worker can correct or type instead. */}
          <div className="mt-4 rounded-[8px] bg-row-hover p-3 text-[13px] leading-5 text-ink-2">
            <textarea
              value={answers[qIndex]}
              onChange={(e) => {
                finalRef.current = e.target.value;
                lastHeardRef.current = Date.now();
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
              onClick={() => finish(false)}
              className="flex h-11 items-center gap-1.5 rounded-[10px] border border-line px-4 text-[13px] font-medium text-ink hover:bg-row-hover"
            >
              <Square size={14} strokeWidth={2} aria-hidden />
              Stop
            </button>
            <button
              type="button"
              onClick={() => advance("tap")}
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
          {countdown !== null && (
            <div className="mt-3 flex items-center justify-between gap-3 rounded-[8px] bg-green-soft px-3 py-2 text-[12px] text-green-ink" aria-live="polite">
              <span>Filing in {countdown}s — tap an answer to check it first.</span>
              <button type="button" onClick={cancelAutoFile} className="shrink-0 rounded-[6px] border border-current px-2 py-0.5 font-medium">
                Wait
              </button>
            </div>
          )}
          {audioUrl && <audio controls src={audioUrl} className="mt-3 w-full" />}
          <ol className="mt-4 space-y-3">
            {QUESTIONS.map((q, i) => (
              <li key={q.key}>
                <span className="block text-[11px] leading-4 text-muted">{q.text}</span>
                <textarea
                  value={answers[i]}
                  onFocus={cancelAutoFile}
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
