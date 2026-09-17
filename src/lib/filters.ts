import type { ActivityType } from "@/db/schema";

/**
 * Filter model shared by the server (SQL) and the client (chips, menus, URLs).
 * Pure data + parsing — no database imports, so client components can use it.
 */

export const SORTS = {
  "date-asc": { label: "Date", column: "startedAt", dir: "asc" },
  "date-desc": { label: "Date (newest)", column: "startedAt", dir: "desc" },
  employee: { label: "Employee", column: "worker", dir: "asc" },
  activity: { label: "Activity", column: "activity", dir: "asc" },
  accuracy: { label: "Accuracy", column: "responseAccuracy", dir: "desc" },
} as const;
export type SortKey = keyof typeof SORTS | "none";

export const PERIODS = {
  today: "Today",
  week: "Last 7 Days",
  month: "This Month",
  all: "All Time",
} as const;
export type PeriodKey = keyof typeof PERIODS;

export const STATUSES = {
  new: "New",
  reviewed: "Reviewed",
  flagged: "Flagged",
  all: "All Statuses",
} as const;
export type StatusKey = keyof typeof STATUSES;

export type LogFilters = {
  q: string;
  sort: SortKey;
  period: PeriodKey;
  status: StatusKey;
  activity: ActivityType | null;
  field: string | null; // field id
};

export const DEFAULT_FILTERS: LogFilters = {
  q: "",
  sort: "date-asc",
  period: "month",
  status: "new",
  activity: null,
  field: null,
};

type Params = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

/** Parses ?q=&sort=&period=&status=&activity=&field= with safe fallbacks. */
export function parseFilters(params: Params): LogFilters {
  const sort = one(params.sort);
  const period = one(params.period);
  const status = one(params.status);
  const activity = one(params.activity);
  return {
    q: one(params.q).trim().slice(0, 100),
    sort: sort === "none" || sort in SORTS ? (sort as SortKey) : DEFAULT_FILTERS.sort,
    period: period in PERIODS ? (period as PeriodKey) : DEFAULT_FILTERS.period,
    status: status in STATUSES ? (status as StatusKey) : DEFAULT_FILTERS.status,
    activity: ACTIVITY_LABELS[activity as ActivityType] ? (activity as ActivityType) : null,
    field: one(params.field) || null,
  };
}

export const ACTIVITY_LABELS: Record<ActivityType, string> = {
  SPRAYING: "Spraying",
  FERTILIZING: "Fertilizing",
  PLANTING: "Planting",
  IRRIGATION: "Irrigation",
  HARVESTING: "Harvesting",
  SCOUTING: "Scouting",
  PRUNING: "Pruning",
  SOIL_WORK: "Soil Work",
  EQUIPMENT_MAINTENANCE: "Equipment Maintenance",
};

