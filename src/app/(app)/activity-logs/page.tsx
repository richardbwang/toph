import type { Metadata } from "next";
import { Mic } from "lucide-react";
import Link from "next/link";
import { LogsTable } from "@/components/logs-table";
import { PageHeader } from "@/components/page-header";
import { SearchBox } from "@/components/search-box";
import { requireUser } from "@/lib/auth";
import { ALL_LOGS_FILTERS, parseFilters } from "@/lib/filters";
import { listFields, listLogs, listTags } from "@/lib/queries";

export const metadata: Metadata = { title: "Activity Logs" };

/** Same table as the dashboard, but every status and every date, newest first. */
export default async function ActivityLogsPage(props: PageProps<"/activity-logs">) {
  const user = await requireUser();
  const filters = parseFilters(await props.searchParams, ALL_LOGS_FILTERS);
  const { farm } = user;
  const [logs, fields, tags] = await Promise.all([listLogs(farm.id, filters, farm.timezone), listFields(farm.id), listTags(farm.id)]);

  return (
    <div className="flex flex-col items-center gap-[10px] px-[16px] md:px-[30px] pb-[30px]">
      <PageHeader title="Activity Logs" subtitle="Every log your team has recorded, across all statuses">
        <div className="flex items-center gap-[10px]">
          <Link
            href="/record"
            className="flex items-center gap-[10px] rounded-[30px] border border-line bg-chip px-[16px] py-[8px] text-[14px] leading-[normal] whitespace-nowrap text-chip-ink shadow-chip hover:bg-ink-2"
          >
            <Mic size={16} aria-hidden />
            New voice log
          </Link>
          <SearchBox pathname="/activity-logs" filters={filters} defaults={ALL_LOGS_FILTERS} />
        </div>
      </PageHeader>
      <LogsTable
        title="Activity Logs"
        pathname="/activity-logs"
        filters={filters}
        defaults={ALL_LOGS_FILTERS}
        total={logs.total}
        rows={logs.rows}
        fields={fields.map((f) => ({ id: f.id, name: f.name }))}
        tags={tags}
        timezone={farm.timezone}
        canEdit={user.role === "ADMIN"}
        showStatus
      />
    </div>
  );
}
