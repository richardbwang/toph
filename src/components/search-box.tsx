"use client";

import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { DEFAULT_FILTERS, type LogFilters } from "@/lib/filters";
import { hrefWith } from "@/lib/url";

/** Search writes `?q=` after a short debounce; the server re-renders the rows. */
export function SearchBox({ pathname, filters, defaults = DEFAULT_FILTERS }: { pathname: string; filters: LogFilters; defaults?: LogFilters }) {
  const router = useRouter();
  const [value, setValue] = useState(filters.q);
  const [, startTransition] = useTransition();

  // When the URL changes underneath us (back button, a chip clearing the
  // query) adopt the new value — the React-sanctioned "derive during render".
  const [seenQ, setSeenQ] = useState(filters.q);
  if (filters.q !== seenQ) {
    setSeenQ(filters.q);
    setValue(filters.q);
  }

  // Debounce: push the typed value into the URL 250ms after the last keystroke.
  useEffect(() => {
    if (value === filters.q) return;
    const t = setTimeout(() => {
      startTransition(() => router.replace(hrefWith(pathname, filters, { q: value }, defaults), { scroll: false }));
    }, 250);
    return () => clearTimeout(t);
  }, [value, filters, pathname, router, defaults]);

  return (
    <label className="flex w-[370px] items-center gap-[10px] rounded-[30px] border border-line bg-surface px-[16px] py-[8px] shadow-chip focus-within:border-ink-2">
      <Search size={16} className="shrink-0 text-placeholder" aria-hidden />
      <input
        type="search"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Search"
        aria-label="Search logs"
        className="min-w-0 flex-1 bg-transparent text-[14px] leading-[normal] text-ink placeholder:text-placeholder outline-none"
      />
    </label>
  );
}
