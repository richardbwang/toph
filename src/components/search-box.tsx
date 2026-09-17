"use client";

import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import type { LogFilters } from "@/lib/filters";
import { hrefWith } from "@/lib/url";

/** Search writes `?q=` after a short debounce; the server re-renders the rows. */
export function SearchBox({ pathname, filters }: { pathname: string; filters: LogFilters }) {
  const router = useRouter();
  const [value, setValue] = useState(filters.q);
  const [, startTransition] = useTransition();
  const last = useRef(filters.q);

  useEffect(() => setValue(filters.q), [filters.q]);

  useEffect(() => {
    if (value === last.current) return;
    const t = setTimeout(() => {
      last.current = value;
      startTransition(() => router.replace(hrefWith(pathname, filters, { q: value }), { scroll: false }));
    }, 250);
    return () => clearTimeout(t);
  }, [value, filters, pathname, router]);

  return (
    <label className="relative block w-[var(--search-w)]">
      <Search size={13} strokeWidth={2} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-2" aria-hidden />
      <input
        type="search"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Search"
        aria-label="Search logs"
        className="h-8 w-full rounded-chip border border-line bg-surface pr-3 pl-8 text-[12px] text-ink placeholder:text-muted-2 outline-none focus:border-ink-2"
      />
    </label>
  );
}
