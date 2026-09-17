import type { Metadata } from "next";
import { CalendarDays, Percent, UserRoundCheck } from "lucide-react";
import { LogsTable } from "@/components/logs-table";
import { SearchBox } from "@/components/search-box";
import { StatCard } from "@/components/stat-card";
import { requireUser } from "@/lib/auth";
import { parseFilters } from "@/lib/filters";
import { dashboardStats, listFields, listLogs, listTags } from "@/lib/queries";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage(props: PageProps<"/dashboard">) {
  const user = await requireUser();
  const filters = parseFilters(await props.searchParams);
  const { farm } = user;

  const [stats, logs, fields, tags] = await Promise.all([
    dashboardStats(farm.id, farm.timezone),
    listLogs(farm.id, filters, farm.timezone),
    listFields(farm.id),
    listTags(farm.id),
  ]);

  return (
    <div className="mx-auto max-w-[var(--content-max)] px-6 pt-6 pb-10">
      <header className="flex items-start justify-between gap-6">
        <div>
          <h1 className="text-[18px] font-semibold leading-6 tracking-[-0.01em] text-ink">Dashboard</h1>
          <p className="mt-0.5 text-[12px] leading-4 text-muted">An overview of your farm and employee activity</p>
        </div>
        <SearchBox pathname="/dashboard" filters={filters} />
      </header>

      <section className="mt-6 grid grid-cols-3 gap-4" aria-label="Key figures">
        <StatCard icon={CalendarDays} label="Todays Recordings" value={stats.todaysRecordings} note={stats.newToday > 0 ? `${stats.newToday} New` : undefined} />
        <StatCard icon={UserRoundCheck} label="Active Workers" value={stats.activeWorkers} />
        <StatCard icon={Percent} label="Response Accuracy" value={stats.responseAccuracy ?? "—"} />
      </section>

      <LogsTable
        title="New Employee Logs"
        pathname="/dashboard"
        filters={filters}
        total={logs.total}
        rows={logs.rows}
        fields={fields.map((f) => ({ id: f.id, name: f.name }))}
        tags={tags}
        timezone={farm.timezone}
        canEdit={user.role === "ADMIN"}
      />
    </div>
  );
}
