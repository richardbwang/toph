import { DEFAULT_FILTERS, type LogFilters } from "@/lib/filters";

/**
 * The table's state (search, sort, period, status, activity, field) lives in
 * the URL. That makes every view refresh-safe, shareable and back-button
 * friendly, and the server can render the right rows on the first request.
 */
export function filtersToParams(f: LogFilters, defaults: LogFilters = DEFAULT_FILTERS): URLSearchParams {
  const p = new URLSearchParams();
  if (f.q) p.set("q", f.q);
  if (f.sort !== defaults.sort) p.set("sort", f.sort);
  if (f.period !== defaults.period) p.set("period", f.period);
  if (f.status !== defaults.status) p.set("status", f.status);
  if (f.activity) p.set("activity", f.activity);
  if (f.field) p.set("field", f.field);
  return p;
}

export function hrefWith(pathname: string, f: LogFilters, changes: Partial<LogFilters>, defaults: LogFilters = DEFAULT_FILTERS): string {
  const p = filtersToParams({ ...f, ...changes }, defaults);
  const qs = p.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}
