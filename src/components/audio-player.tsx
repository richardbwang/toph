"use client";

import { Pause, Play } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Waveform + play button for one recording.
 *
 * The bars come from `recording.waveform` — RMS peaks computed once when the
 * clip was ingested — so drawing them costs nothing at render time and never
 * requires decoding audio in the browser. A hidden <audio> element does the
 * playback; its current time drives the playhead and the played/unplayed
 * colouring, exactly like the Figma waveform (0.88px lines, #003930, the
 * unplayed part at 25% opacity).
 */
const HEIGHT = 80.96;
const MIN_BAR = 7.04;

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
  }, [src]);

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

  return (
    <div className="flex w-full flex-col items-center gap-[20px]">
      {src && <audio ref={audioRef} src={src} preload="metadata" />}
      <svg
        width="100%"
        height={HEIGHT}
        viewBox={`0 0 ${n} ${HEIGHT}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`Audio waveform, ${Math.round(durationSec)} seconds`}
        onClick={seek}
        className={src ? "block cursor-pointer" : "block"}
      >
        {peaks.map((p, i) => {
          const h = MIN_BAR + Math.max(0, Math.min(1, p)) * (HEIGHT - MIN_BAR);
          // Before playback starts every bar is drawn in the full colour (as in
          // the design); once playing, bars past the playhead fade to 25%.
          const played = progress === 0 || (i + 0.5) / n <= progress;
          return (
            <line
              key={i}
              x1={i + 0.5}
              x2={i + 0.5}
              y1={(HEIGHT - h) / 2}
              y2={(HEIGHT + h) / 2}
              vectorEffect="non-scaling-stroke"
              strokeWidth={0.88}
              className={played ? "stroke-wave" : "stroke-wave-muted opacity-25"}
            />
          );
        })}
        {progress > 0 && (
          <line x1={progress * n} x2={progress * n} y1={0} y2={HEIGHT} vectorEffect="non-scaling-stroke" strokeWidth={1} className="stroke-wave" />
        )}
      </svg>
      <button
        type="button"
        onClick={toggle}
        disabled={!src}
        className="flex w-full items-center justify-center gap-[10px] rounded-[7.04px] border border-stroke bg-surface px-[8.8px] py-[10.56px] text-[16px] leading-[normal] whitespace-nowrap text-ink hover:bg-row-hover disabled:opacity-50"
      >
        {playing ? <Pause size={16} aria-hidden /> : <Play size={16} aria-hidden />}
        {playing ? "Pause Recording" : "Play Recording"}
      </button>
    </div>
  );
}
