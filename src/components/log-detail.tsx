"use client";

import { Expand, X } from "lucide-react";
import { useEffect, useState } from "react";
import { AudioPlayer } from "./audio-player";
import { FieldMap, type MapField } from "./field-map";
import { TagEditor } from "./tag-editor";
import type { LogRow } from "@/lib/queries";

/**
 * The expanded row: recording + tags + summary on the left (592px, as in the
 * design), the field's satellite map on the right, stretched to match.
 */
export function LogDetail({
  row,
  tagSuggestions,
  canEdit,
}: {
  row: LogRow;
  tagSuggestions: { id: string; name: string }[];
  canEdit: boolean;
}) {
  const [mapOpen, setMapOpen] = useState(false);
  const field: MapField | null = row.field
    ? { id: row.field.id, name: row.field.name, crop: row.field.crop, centerLat: row.field.centerLat, centerLng: row.field.centerLng, boundary: row.field.boundary }
    : null;

  useEffect(() => {
    if (!mapOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMapOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [mapOpen]);

  return (
    <div className="flex w-full flex-col items-center justify-center gap-[40px] bg-surface p-[24px] md:p-[40px] min-[1400px]:flex-row">
      {/* Left: recording, tags, summary */}
      <div className="flex w-full shrink-0 flex-col items-center gap-[20px] min-[1400px]:w-[var(--detail-left-w)]">
        <AudioPlayer src={row.audioSrc} peaks={row.recording?.waveform ?? []} durationSec={row.recording?.durationSec ?? 0} />
        <TagEditor logId={row.id} tags={row.tags} suggestions={tagSuggestions} canEdit={canEdit} />
        <div className="flex w-full flex-col items-start gap-[4px] text-[16px] leading-[normal] text-ink">
          <h3 className="whitespace-nowrap">Summary</h3>
          <p className="w-full opacity-30">{row.summary}</p>
        </div>
      </div>

      {/* Right: the field on a satellite map */}
      <div className="flex w-full min-w-px flex-1 flex-col justify-center gap-[20px] self-stretch">
        <div className="relative min-h-[240px] flex-1 overflow-hidden rounded-[14px] border-[0.88px] border-line-3">
          {field ? (
            <FieldMap fields={[field]} focus={field} interactive={false} zoom={15} />
          ) : (
            <div className="grid h-full place-items-center bg-row-hover text-[14px] text-muted">No field recorded for this log</div>
          )}
        </div>
        <button
          type="button"
          onClick={() => setMapOpen(true)}
          disabled={!field}
          className="flex w-full items-center justify-center gap-[10px] rounded-[7.04px] border border-stroke bg-surface px-[8.8px] py-[10.56px] text-[16px] leading-[normal] whitespace-nowrap text-ink hover:bg-row-hover disabled:opacity-50"
        >
          <Expand size={16} aria-hidden />
          Expand Map
        </button>
      </div>

      {mapOpen && field && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-[24px]" onClick={() => setMapOpen(false)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`${field.name} map`}
            onClick={(e) => e.stopPropagation()}
            className="flex h-[min(80vh,760px)] w-[min(96vw,1200px)] flex-col overflow-hidden rounded-[20px] bg-surface shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-line-2 px-[20px] py-[14px]">
              <div>
                <div className="text-[16px] leading-[normal] text-ink">{field.name}</div>
                <div className="text-[14px] leading-[normal] text-muted">
                  {field.crop ? `${field.crop} · ` : ""}
                  {field.centerLat.toFixed(4)}, {field.centerLng.toFixed(4)}
                </div>
              </div>
              <button type="button" onClick={() => setMapOpen(false)} aria-label="Close map" className="grid size-[32px] place-items-center rounded-[4px] text-muted hover:bg-row-hover hover:text-ink">
                <X size={16} />
              </button>
            </div>
            <div className="min-h-0 flex-1">
              <FieldMap fields={[field]} focus={field} interactive zoom={16} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
