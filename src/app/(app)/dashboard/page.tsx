import type { Metadata } from "next";
import { Calendar, ClipboardPen, Percent } from "lucide-react";
import { LogsTable } from "@/components/logs-table";
import { PageHeader } from "@/components/page-header";
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
    <div className="flex flex-col items-center gap-[10px] px-[30px]">
      <PageHeader title="Dashboard" subtitle="An overview of your farm and employee activity">
        <SearchBox pathname="/dashboard" filters={filters} />
      </PageHeader>

      <section className="flex w-full items-start gap-[10px]" aria-label="Key figures">
        <StatCard icon={Calendar} label="Todays Recordings" value={stats.todaysRecordings} note={stats.newToday > 0 ? `${stats.newToday} New` : undefined} />
        <StatCard icon={ClipboardPen} label="Active Workers" value={stats.activeWorkers} />
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
