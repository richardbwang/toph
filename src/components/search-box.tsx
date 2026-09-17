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
