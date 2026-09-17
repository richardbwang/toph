"use client";

import { Pause, Play } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Waveform + play button for one recording.
 *
 * The bars come from `recording.waveform` — 120 RMS peaks computed once when
 * the clip was ingested — so drawing them costs nothing at render time and
 * never requires decoding the audio in the browser. The hidden <audio>
 * element does the actual playback; we mirror its time into the SVG.
 */
export function AudioPlayer({ src, peaks, durationSec }: { src: string | null; peaks: number[]; durationSec: number }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0); // 0..1

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    const onTime = () => setProgress(el.duration ? el.currentTime / el.duration : 0);
    const onEnd = () => {
      setPlaying(false);
      setProgress(0);
    };
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    el.addEventListener("timeupdate", onTime);
    el.addEventListener("ended", onEnd);
    el.addEventListener("play", onPlay);
    el.addEventListener("pause", onPause);
    return () => {
      el.removeEventListener("timeupdate", onTime);
      el.removeEventListener("ended", onEnd);
      el.removeEventListener("play", onPlay);
      el.removeEventListener("pause", onPause);
    };
  }, []);

  const toggle = useCallback(() => {
    const el = audioRef.current;
    if (!el || !src) return;
    if (el.paused) void el.play();
    else el.pause();
  }, [src]);

  const seek = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      const el = audioRef.current;
      if (!el) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const frac = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
      const dur = el.duration || durationSec;
      if (dur) {
        el.currentTime = frac * dur;
        setProgress(frac);
      }
    },
    [durationSec],
  );

  const n = Math.max(peaks.length, 1);
  const slot = 100 / n;
  const barW = slot * 0.5;

  return (
    <div>
      {src && <audio ref={audioRef} src={src} preload="metadata" />}
      <div className="relative py-1">
        <svg
          width="100%"
          height="40"
          role="img"
          aria-label="Audio waveform"
          onClick={seek}
          className={src ? "cursor-pointer" : ""}
        >
          {peaks.map((p, i) => {
            const h = Math.max(6, p * 100);
            const played = i / n < progress;
            return (
              <rect
                key={i}
                x={`${i * slot + (slot - barW) / 2}%`}
                y={`${(100 - h) / 2}%`}
                width={`${barW}%`}
                height={`${h}%`}
                rx="1"
                className={played ? "fill-ink" : "fill-[#b9c8be]"}
              />
            );
          })}
          {/* playhead */}
          <line x1={`${progress * 100}%`} x2={`${progress * 100}%`} y1="0" y2="100%" className="stroke-ink" strokeWidth="1.5" />
        </svg>
      </div>
      <button
        type="button"
        onClick={toggle}
        disabled={!src}
        className="mt-2 flex h-8 w-full items-center justify-center gap-1.5 rounded-[8px] border border-line bg-surface text-[12px] font-medium text-ink hover:bg-hover disabled:opacity-50"
      >
        {playing ? <Pause size={13} strokeWidth={2} aria-hidden /> : <Play size={13} strokeWidth={2} aria-hidden />}
        {playing ? "Pause Recording" : "Play Recording"}
      </button>
    </div>
  );
}
