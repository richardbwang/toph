"use client";

import { AudioLines, CheckCheck, Flag, Trash2 } from "lucide-react";
import { Fragment, useState, useTransition } from "react";
import { deleteLogs, setLogStatus } from "@/lib/actions";
import { ACTIVITY_LABELS, type LogFilters } from "@/lib/filters";
import type { LogRow } from "@/lib/queries";
import { formatDate, formatTimeRange } from "@/lib/time";
import { FilterChips } from "./filter-chips";
import { LogDetail } from "./log-detail";

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
    <section className="mt-4 rounded-card border border-line bg-surface" aria-label={title}>
      <header className="flex items-center justify-between gap-4 px-4 py-3">
        <h2 className="flex items-center gap-2 text-[13px] font-semibold leading-5 text-ink">
          <AudioLines size={15} strokeWidth={1.75} aria-hidden />
          <span>
            {title} <span className="font-normal text-muted">({total})</span>
          </span>
        </h2>
        <FilterChips pathname={pathname} filters={filters} total={total} fields={fields} />
      </header>

      {canEdit && selected.size > 0 && (
        <div className="flex items-center gap-2 border-t border-line bg-hover px-4 py-2 text-[12px] text-ink-2">
          <span className="font-medium">{selected.size} selected</span>
          <span className="mx-1 text-line">|</span>
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

      <table className="w-full border-collapse text-[12px]">
        <thead>
          <tr className="border-t border-line text-left text-[10px] font-medium uppercase tracking-[0.06em] text-muted-2">
            <th scope="col" className="w-12 px-4 py-2.5">
              <Checkbox checked={allSelected} onChange={toggleAll} label="Select all" disabled={rows.length === 0} />
            </th>
            <th scope="col" className="py-2.5 pr-4 font-medium">
              Employee
            </th>
            <th scope="col" className="py-2.5 pr-4 font-medium">
              Activity
            </th>
            <th scope="col" className="py-2.5 pr-4 font-medium">
              Date
            </th>
            <th scope="col" className="py-2.5 pr-4 font-medium">
              Field
            </th>
            <th scope="col" className="py-2.5 pr-4 font-medium">
              Time
            </th>
            <th scope="col" className="w-20 py-2.5 pr-4">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={7} className="px-4 py-10 text-center text-[12px] text-muted">
                No logs match these filters.
              </td>
            </tr>
          )}
          {rows.map((row) => {
            const open = expanded === row.id;
            return (
              <Fragment key={row.id}>
                <tr
                  onClick={() => setExpanded(open ? null : row.id)}
                  aria-expanded={open}
                  className="cursor-pointer border-t border-line-2 text-ink-2 hover:bg-hover aria-expanded:bg-selected"
                >
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    <Checkbox checked={selected.has(row.id)} onChange={() => toggleOne(row.id)} label={`Select ${row.worker.name}`} />
                  </td>
                  <td className="py-3 pr-4 text-ink">{row.worker.name}</td>
                  <td className="py-3 pr-4">{ACTIVITY_LABELS[row.activity]}</td>
                  <td className="py-3 pr-4">{formatDate(row.startedAt, timezone)}</td>
                  <td className="py-3 pr-4 uppercase">{row.field?.name ?? "—"}</td>
                  <td className="py-3 pr-4">{formatTimeRange(row.startedAt, row.endedAt, timezone)}</td>
                  <td className="py-2 pr-4 text-right">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setExpanded(open ? null : row.id);
                      }}
                      className="h-7 rounded-chip border border-line bg-surface px-3 text-[11px] font-medium text-ink hover:bg-hover"
                    >
                      {open ? "Close" : "View"}
                    </button>
                  </td>
                </tr>
                {open && (
                  <tr className="bg-surface">
                    <td colSpan={7} className="p-0">
                      <LogDetail row={row} tagSuggestions={tags} canEdit={canEdit} />
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

function Checkbox({ checked, onChange, label, disabled }: { checked: boolean; onChange: () => void; label: string; disabled?: boolean }) {
  return (
    <input
      type="checkbox"
      checked={checked}
      onChange={onChange}
      disabled={disabled}
      aria-label={label}
      className="size-3.5 cursor-pointer appearance-none rounded-[3px] border border-[#c9c9c9] bg-surface align-middle checked:border-ink checked:bg-ink checked:bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22white%22 stroke-width=%223.5%22 stroke-linecap=%22round%22 stroke-linejoin=%22round%22><path d=%22M20 6 9 17l-5-5%22/></svg>')] checked:bg-center checked:bg-no-repeat checked:[background-size:10px] disabled:opacity-40"
    />
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
      className={`inline-flex h-7 items-center gap-1.5 rounded-chip border border-line bg-surface px-2.5 text-[11px] font-medium hover:bg-selected disabled:opacity-60 ${danger ? "text-[#c62828]" : "text-ink"}`}
    >
      <Icon size={12} strokeWidth={2} aria-hidden />
      {label}
    </button>
  );
}
