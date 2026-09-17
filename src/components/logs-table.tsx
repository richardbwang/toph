"use client";

import { AudioLines, CheckCheck, Flag, Square, SquareCheck, Trash2 } from "lucide-react";
import { Fragment, useState, useTransition } from "react";
import { deleteLogs, setLogStatus } from "@/lib/actions";
import { ACTIVITY_LABELS, type LogFilters } from "@/lib/filters";
import type { LogRow } from "@/lib/queries";
import { formatDate, formatTimeRange } from "@/lib/time";
import { FilterChips } from "./filter-chips";
import { LogDetail } from "./log-detail";

/**
 * The logs card. Rows are flex rows (like the Figma frame) rather than a
 * <table>, so the expanded detail panel can sit between rows at full width.
 * ARIA table roles keep it readable for screen readers.
 */
export function LogsTable({
  title,
  pathname,
  filters,
  total,
  rows,
  fields,
  tags,
  timezone,
  canEdit,
}: {
  title: string;
  pathname: string;
  filters: LogFilters;
  total: number;
  rows: LogRow[];
  fields: { id: string; name: string }[];
  tags: { id: string; name: string }[];
  timezone: string;
  canEdit: boolean;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();

  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.id)));
  const toggleOne = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const bulk = (fn: (ids: string[]) => Promise<unknown>) => {
    const ids = [...selected];
    startTransition(async () => {
      await fn(ids);
      setSelected(new Set());
    });
  };

  return (
    <section className="flex w-full flex-col items-center overflow-clip rounded-[20px] border border-line-2 bg-surface" aria-label={title}>
      {/* Card header */}
      <header className="flex w-full items-center justify-between border-b border-line-2 px-[30px] py-[20px]">
        <h2 className="flex items-center gap-[10px]">
          <AudioLines size={16} className="shrink-0 text-ink" aria-hidden />
          <span className="text-[16px] leading-[normal] whitespace-nowrap text-ink">
            {title} <span className="text-muted-2">({total})</span>
          </span>
        </h2>
        <FilterChips pathname={pathname} filters={filters} total={total} fields={fields} />
      </header>

      {/* Bulk actions — only visible once something is checked */}
      {canEdit && selected.size > 0 && (
        <div className="flex w-full items-center gap-[10px] border-b border-line-2 bg-row-hover px-[30px] py-[10px] text-[14px] text-ink-2">
          <span>{selected.size} selected</span>
          <BulkButton icon={CheckCheck} label="Mark reviewed" disabled={pending} onClick={() => bulk((ids) => setLogStatus(ids, "REVIEWED"))} />
          <BulkButton icon={Flag} label="Flag" disabled={pending} onClick={() => bulk((ids) => setLogStatus(ids, "FLAGGED"))} />
          <BulkButton icon={CheckCheck} label="Mark new" disabled={pending} onClick={() => bulk((ids) => setLogStatus(ids, "NEW"))} />
          <BulkButton
            icon={Trash2}
            label="Delete"
            disabled={pending}
            danger
            onClick={() => {
              if (window.confirm(`Delete ${selected.size} log${selected.size === 1 ? "" : "s"}? This cannot be undone.`)) bulk(deleteLogs);
            }}
          />
        </div>
      )}

      <div role="table" aria-label={title} className="w-full">
        {/* Column headers */}
        <div role="row" className="flex w-full items-center justify-between border-b border-line px-[20px]">
          <div role="columnheader" className="flex items-center px-[20px] opacity-30">
            <Checkbox checked={allSelected} onChange={toggleAll} label="Select all" disabled={rows.length === 0} />
          </div>
          {["EMPLOYEE", "ACTIVITY", "DATE", "FIELD", "TIME"].map((h) => (
            <div key={h} role="columnheader" className="flex min-w-px flex-1 items-center px-[10px] py-[20px] opacity-30">
              <span className="text-[14px] leading-[normal] whitespace-nowrap text-ink-2">{h}</span>
            </div>
          ))}
          <div role="columnheader" className="h-[58px] w-[92px] shrink-0">
            <span className="sr-only">Actions</span>
          </div>
        </div>

        {rows.length === 0 && (
          <div role="row" className="flex w-full items-center justify-center px-[20px] py-[40px]">
            <span role="cell" className="text-[14px] text-muted">
              No logs match these filters.
            </span>
          </div>
        )}

        {rows.map((row, i) => {
          const open = expanded === row.id;
          const last = i === rows.length - 1;
          return (
            <Fragment key={row.id}>
              <div
                role="row"
                aria-expanded={open}
                onClick={() => setExpanded(open ? null : row.id)}
                className={`flex w-full cursor-pointer items-center justify-between px-[20px] hover:bg-row-hover aria-expanded:bg-row-hover ${last && !open ? "" : "border-b border-line-2"}`}
              >
                <div role="cell" className="flex items-center px-[20px] opacity-20 has-[input:checked]:opacity-100" onClick={(e) => e.stopPropagation()}>
                  <Checkbox checked={selected.has(row.id)} onChange={() => toggleOne(row.id)} label={`Select ${row.worker.name}`} />
                </div>
                <Cell>{row.worker.name}</Cell>
                <Cell>{ACTIVITY_LABELS[row.activity]}</Cell>
                <Cell>{formatDate(row.startedAt, timezone)}</Cell>
                <Cell>{row.field ? row.field.name.toUpperCase() : "—"}</Cell>
                <Cell>{formatTimeRange(row.startedAt, row.endedAt, timezone)}</Cell>
                <div role="cell" className="flex h-[58px] w-[92px] shrink-0 items-center justify-center px-[30px] py-[20px]">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setExpanded(open ? null : row.id);
                    }}
                    className="flex items-center justify-center rounded-[80px] border border-line-2 bg-surface px-[16px] py-[8px] text-[14px] leading-[normal] whitespace-nowrap text-ink-2 shadow-chip hover:bg-row-hover"
                  >
                    {open ? "Close" : "View"}
                  </button>
                </div>
              </div>
              {open && (
                <div role="row" className={`w-full bg-surface ${last ? "" : "border-b border-line-2"}`}>
                  <div role="cell" className="w-full">
                    <LogDetail row={row} tagSuggestions={tags} canEdit={canEdit} />
                  </div>
                </div>
              )}
            </Fragment>
          );
        })}
      </div>
    </section>
  );
}

function Cell({ children }: { children: React.ReactNode }) {
  return (
    <div role="cell" className="flex min-w-px flex-1 items-center px-[10px] py-[20px]">
      <span className="truncate text-[14px] leading-[normal] whitespace-nowrap text-ink-2">{children}</span>
    </div>
  );
}

/** The design draws the checkbox as a 16px Lucide "square"; checked swaps in "square-check". */
function Checkbox({ checked, onChange, label, disabled }: { checked: boolean; onChange: () => void; label: string; disabled?: boolean }) {
  return (
    <label className={`relative flex size-[16px] items-center justify-center ${disabled ? "" : "cursor-pointer"}`}>
      <input type="checkbox" checked={checked} onChange={onChange} disabled={disabled} aria-label={label} className="peer sr-only" />
      {checked ? <SquareCheck size={16} className="text-ink" aria-hidden /> : <Square size={16} className="text-ink" aria-hidden />}
      <span className="pointer-events-none absolute -inset-1 rounded-[3px] peer-focus-visible:ring-2 peer-focus-visible:ring-ink/40" aria-hidden />
    </label>
  );
}

function BulkButton({
  icon: Icon,
  label,
  onClick,
  disabled,
  danger,
}: {
  icon: typeof CheckCheck;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center gap-[8px] rounded-[80px] border border-line bg-surface px-[12px] py-[6px] text-[14px] leading-[normal] shadow-chip hover:bg-row-hover disabled:opacity-60 ${danger ? "text-danger" : "text-ink-2"}`}
    >
      <Icon size={14} aria-hidden />
      {label}
    </button>
  );
}
