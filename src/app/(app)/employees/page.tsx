import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { requireUser } from "@/lib/auth";
import { listWorkersWithStats } from "@/lib/queries";
import { formatDate } from "@/lib/time";

export const metadata: Metadata = { title: "Employees" };

export default async function EmployeesPage() {
  const user = await requireUser();
  const workers = await listWorkersWithStats(user.farm.id, user.farm.timezone);
  const active = workers.filter((w) => w.status === "ACTIVE").length;

  return (
    <div className="flex flex-col items-center gap-[10px] px-[16px] md:px-[30px] pb-[30px]">
      <PageHeader title="Employees" subtitle={`${active} active workers on ${user.farm.name}`} />
      <section className="w-full overflow-clip rounded-[20px] border border-line-2 bg-surface">
        <div role="table" className="w-full">
          <div role="row" className="flex items-center border-b border-line px-[20px]">
            {["NAME", "EMAIL", "STATUS", "LOGS THIS MONTH", "ACCURACY", "LAST ACTIVE"].map((h) => (
              <div key={h} role="columnheader" className="flex min-w-px flex-1 items-center px-[10px] py-[20px] opacity-30">
                <span className="text-[14px] leading-[normal] whitespace-nowrap text-ink-2">{h}</span>
              </div>
            ))}
          </div>
          {workers.map((w, i) => (
            <Link
              key={w.id}
              href={`/activity-logs?q=${encodeURIComponent(w.name)}`}
              role="row"
              className={`flex items-center px-[20px] hover:bg-row-hover ${i === workers.length - 1 ? "" : "border-b border-line-2"}`}
            >
              <Cell>{w.name}</Cell>
              <Cell>{w.email}</Cell>
              <Cell>
                <span className={w.status === "ACTIVE" ? "text-green-ink" : "text-muted"}>{w.status === "ACTIVE" ? "Active" : "Inactive"}</span>
              </Cell>
              <Cell>{w.logsThisMonth}</Cell>
              <Cell>{w.accuracy == null ? "—" : `${w.accuracy}%`}</Cell>
              <Cell>{w.lastActiveAt ? formatDate(w.lastActiveAt, user.farm.timezone) : "—"}</Cell>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}

function Cell({ children }: { children: React.ReactNode }) {
  return (
    <div role="cell" className="flex min-w-px flex-1 items-center px-[10px] py-[20px]">
      <span className="truncate text-[14px] leading-[normal] whitespace-nowrap text-ink-2">{children}</span>
    </div>
  );
}
