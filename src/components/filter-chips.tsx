"use client";

import { Funnel, ListFilter, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { ACTIVITY_LABELS, DEFAULT_FILTERS, PERIODS, SORTS, STATUSES, type LogFilters } from "@/lib/filters";
import { hrefWith } from "@/lib/url";
import { Menu, MenuItem, MenuLabel } from "./menu";
import type { ActivityType } from "@/db/schema";

/**
 * The chip row: each menu button is preceded by a dark chip that shows its
 * current selection and clears it with ×. Every chip is a plain link, so the
 * state lives in the URL and the server renders the matching rows.
 */
export function FilterChips({
  pathname,
  filters,
  total,
  fields,
}: {
  pathname: string;
  filters: LogFilters;
  total: number;
  fields: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const go = (changes: Partial<LogFilters>) => startTransition(() => router.push(hrefWith(pathname, filters, changes), { scroll: false }));

  const fieldName = filters.field ? fields.find((f) => f.id === filters.field)?.name : null;

  return (
    <div className="flex flex-wrap items-center gap-[10px]">
      {filters.sort !== "none" && (
        <ActiveChip label={SORTS[filters.sort].label} href={hrefWith(pathname, filters, { sort: "none" })} clearLabel="Clear sort" />
      )}

      <Menu
        trigger={({ open, toggle, id }) => (
          <MenuButton open={open} toggle={toggle} controls={id} icon={<ListFilter size={16} aria-hidden />} label="Sort" />
        )}
      >
        {(close) => (
          <>
            <MenuLabel>Sort by</MenuLabel>
            {(Object.keys(SORTS) as (keyof typeof SORTS)[]).map((key) => (
              <MenuItem key={key} active={filters.sort === key} onClick={() => (close(), go({ sort: key }))}>
                {SORTS[key].label}
              </MenuItem>
            ))}
          </>
        )}
      </Menu>

      {filters.period !== "all" && (
        <ActiveChip
          label={`${PERIODS[filters.period]} (${total})`}
          href={hrefWith(pathname, filters, { period: "all" })}
          clearLabel="Show all time"
        />
      )}
      {filters.status !== DEFAULT_FILTERS.status && filters.status !== "all" && (
        <ActiveChip label={STATUSES[filters.status]} href={hrefWith(pathname, filters, { status: DEFAULT_FILTERS.status })} clearLabel="Clear status filter" />
      )}
      {filters.status === "all" && (
        <ActiveChip label="All Statuses" href={hrefWith(pathname, filters, { status: DEFAULT_FILTERS.status })} clearLabel="Back to new logs" />
      )}
      {filters.activity && (
        <ActiveChip label={ACTIVITY_LABELS[filters.activity]} href={hrefWith(pathname, filters, { activity: null })} clearLabel="Clear activity filter" />
      )}
      {fieldName && <ActiveChip label={fieldName} href={hrefWith(pathname, filters, { field: null })} clearLabel="Clear field filter" />}

      <Menu
        width={224}
        trigger={({ open, toggle, id }) => (
          <MenuButton open={open} toggle={toggle} controls={id} icon={<Funnel size={16} aria-hidden />} label="Filter" />
        )}
      >
        {(close) => (
          <div className="max-h-[420px] overflow-y-auto">
            <MenuLabel>Period</MenuLabel>
            {(Object.keys(PERIODS) as (keyof typeof PERIODS)[]).map((key) => (
              <MenuItem key={key} active={filters.period === key} onClick={() => (close(), go({ period: key }))}>
                {PERIODS[key]}
              </MenuItem>
            ))}
            <MenuLabel>Status</MenuLabel>
            {(Object.keys(STATUSES) as (keyof typeof STATUSES)[]).map((key) => (
              <MenuItem key={key} active={filters.status === key} onClick={() => (close(), go({ status: key }))}>
                {STATUSES[key]}
              </MenuItem>
            ))}
            <MenuLabel>Activity</MenuLabel>
            <MenuItem active={!filters.activity} onClick={() => (close(), go({ activity: null }))}>
              All Activities
            </MenuItem>
            {(Object.keys(ACTIVITY_LABELS) as ActivityType[]).map((key) => (
              <MenuItem key={key} active={filters.activity === key} onClick={() => (close(), go({ activity: key }))}>
                {ACTIVITY_LABELS[key]}
              </MenuItem>
            ))}
            <MenuLabel>Field</MenuLabel>
            <MenuItem active={!filters.field} onClick={() => (close(), go({ field: null }))}>
              All Fields
            </MenuItem>
            {fields.map((f) => (
              <MenuItem key={f.id} active={filters.field === f.id} onClick={() => (close(), go({ field: f.id }))}>
                {f.name}
              </MenuItem>
            ))}
          </div>
        )}
      </Menu>
    </div>
  );
}

function ActiveChip({ label, href, clearLabel }: { label: string; href: string; clearLabel: string }) {
  return (
    <Link
      href={href}
      scroll={false}
      aria-label={`${label} — ${clearLabel}`}
      className="flex items-center justify-center gap-[10px] rounded-[80px] border border-line bg-chip px-[16px] py-[8px] text-[14px] leading-[normal] whitespace-nowrap text-chip-ink shadow-chip hover:bg-ink-2"
    >
      <X size={16} aria-hidden />
      <span>{label}</span>
    </Link>
  );
}

function MenuButton({
  open,
  toggle,
  controls,
  icon,
  label,
}: {
  open: boolean;
  toggle: () => void;
  controls: string;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={toggle}
      aria-haspopup="menu"
      aria-expanded={open}
      aria-controls={controls}
      className="flex items-center justify-center gap-[10px] rounded-[80px] border border-line bg-surface px-[16px] py-[8px] text-[14px] leading-[normal] whitespace-nowrap text-ink-2 shadow-chip hover:bg-row-hover aria-expanded:bg-row-hover"
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}
