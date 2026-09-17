"use client";

import { Maximize2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { AudioPlayer } from "./audio-player";
import { FieldMap, type MapField } from "./field-map";
import { TagEditor } from "./tag-editor";
import type { LogRow } from "@/lib/queries";

/** The expanded row: recording on the left, the field's satellite map on the right. */
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
    <div className="grid grid-cols-[minmax(0,1fr)_var(--detail-map-w)] gap-6 px-4 pt-3 pb-5">
      <div>
        <AudioPlayer src={row.audioSrc} peaks={row.recording?.waveform ?? []} durationSec={row.recording?.durationSec ?? 0} />
        <div className="mt-2.5">
          <TagEditor logId={row.id} tags={row.tags} suggestions={tagSuggestions} canEdit={canEdit} />
        </div>
        <h3 className="mt-4 text-[12px] font-semibold leading-4 text-ink">Summary</h3>
        <p className="mt-1.5 text-[11px] leading-[15px] text-muted">{row.summary}</p>
      </div>

      <div>
        <div className="h-[var(--detail-map-h)] overflow-hidden rounded-[8px] border border-line">
          {field ? (
            <FieldMap fields={[field]} focus={field} interactive={false} zoom={15} />
          ) : (
            <div className="grid h-full place-items-center bg-hover text-[12px] text-muted">No field recorded</div>
          )}
        </div>
        <button
          type="button"
          onClick={() => setMapOpen(true)}
          disabled={!field}
          className="mt-2.5 flex h-8 w-full items-center justify-center gap-1.5 rounded-[8px] border border-line bg-surface text-[12px] font-medium text-ink hover:bg-hover disabled:opacity-50"
        >
          <Maximize2 size={13} strokeWidth={2} aria-hidden />
          Expand Map
        </button>
      </div>

      {mapOpen && field && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6" onClick={() => setMapOpen(false)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`${field.name} map`}
            onClick={(e) => e.stopPropagation()}
            className="flex h-[min(80vh,720px)] w-[min(96vw,1100px)] flex-col overflow-hidden rounded-card bg-surface shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <div>
                <div className="text-[13px] font-semibold text-ink">{field.name}</div>
                <div className="text-[11px] text-muted">
                  {field.crop ? `${field.crop} · ` : ""}
                  {field.centerLat.toFixed(4)}, {field.centerLng.toFixed(4)}
                </div>
              </div>
              <button type="button" onClick={() => setMapOpen(false)} aria-label="Close map" className="grid size-8 place-items-center rounded-md text-muted hover:bg-hover hover:text-ink">
                <X size={16} strokeWidth={2} />
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
