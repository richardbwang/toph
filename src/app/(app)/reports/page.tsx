import type { Metadata } from "next";
import { Download } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { requireUser } from "@/lib/auth";
import { ACTIVITY_LABELS } from "@/lib/filters";
import { monthlyReport } from "@/lib/queries";
import { formatDate } from "@/lib/time";

export const metadata: Metadata = { title: "Reports" };

export default async function ReportsPage() {
  const user = await requireUser();
  const tz = user.farm.timezone;
  const r = await monthlyReport(user.farm.id, tz);
  const month = new Intl.DateTimeFormat("en-US", { timeZone: tz, month: "long", year: "numeric" }).format(r.monthStart);
  const maxActivity = Math.max(1, ...r.byActivity.map((a) => a.n));

  return (
    <div className="flex flex-col items-center gap-[10px] px-[16px] md:px-[30px] pb-[30px]">
      <PageHeader title="Reports" subtitle={`${month} — ${r.totals.logs} logs, ${r.totals.hours} field hours`}>
        <a
          href="/api/reports/logs.csv?period=month"
          className="flex items-center gap-[10px] rounded-[30px] border border-line bg-surface px-[16px] py-[8px] text-[14px] leading-[normal] whitespace-nowrap text-ink-2 shadow-chip hover:bg-row-hover"
        >
          <Download size={16} aria-hidden />
          Export CSV
        </a>
      </PageHeader>

      <div className="flex w-full items-start gap-[10px]">
        <Card title="By activity">
          {r.byActivity.length === 0 && <Empty />}
          {r.byActivity.map((a) => (
            <div key={a.activity} className="flex items-center gap-[12px] px-[20px] py-[10px]">
              <span className="w-[170px] shrink-0 text-[14px] leading-[normal] text-ink-2">{ACTIVITY_LABELS[a.activity]}</span>
              <span className="h-[8px] flex-1 overflow-hidden rounded-[4px] bg-line-2">
                <span className="block h-full rounded-[4px] bg-wave" style={{ width: `${(a.n / maxActivity) * 100}%` }} />
              </span>
              <span className="w-[90px] shrink-0 text-right text-[14px] leading-[normal] text-muted">
                {a.n} · {a.hours}h
              </span>
            </div>
          ))}
        </Card>
        <Card title="By field">
          {r.byField.length === 0 && <Empty />}
          {r.byField.map((f) => (
            <div key={f.fieldId ?? "none"} className="flex items-center justify-between px-[20px] py-[10px]">
              <span className="text-[14px] leading-[normal] text-ink-2">
                {f.name ?? "No field"} <span className="text-muted">{f.crop ? `· ${f.crop}` : ""}</span>
              </span>
              <span className="text-[14px] leading-[normal] text-muted">{f.n} log{f.n === 1 ? "" : "s"}</span>
            </div>
          ))}
        </Card>
      </div>

      <Card title="Product applications" subtitle="What was applied where — the records a pesticide-use report is built from">
        {r.applications.length === 0 && <Empty />}
        {r.applications.length > 0 && (
          <div role="table" className="w-full">
            <div role="row" className="flex items-center border-b border-line px-[10px]">
              {["DATE", "WORKER", "FIELD", "ACTIVITY", "PRODUCT", "AMOUNT", "STATUS"].map((h) => (
                <div key={h} role="columnheader" className="flex min-w-px flex-1 items-center px-[10px] py-[14px] opacity-30">
                  <span className="text-[14px] leading-[normal] whitespace-nowrap text-ink-2">{h}</span>
                </div>
              ))}
            </div>
            {r.applications.map((a, i) => (
              <div key={a.id} role="row" className={`flex items-center px-[10px] ${i === r.applications.length - 1 ? "" : "border-b border-line-2"}`}>
                <Cell>{formatDate(a.startedAt, tz)}</Cell>
                <Cell>{a.worker}</Cell>
                <Cell>{a.field ?? "—"}</Cell>
                <Cell>{ACTIVITY_LABELS[a.activity]}</Cell>
                <Cell>{a.product}</Cell>
                <Cell>{a.quantity != null ? `${a.quantity} ${a.unit ?? ""}` : "—"}</Cell>
                <Cell>{a.status === "NEW" ? "New" : a.status === "REVIEWED" ? "Reviewed" : "Flagged"}</Cell>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="flex w-full min-w-px flex-1 flex-col overflow-clip rounded-[20px] border border-line-2 bg-surface">
      <div className="border-b border-line-2 px-[20px] py-[16px]">
        <h2 className="text-[16px] leading-[normal] text-ink">{title}</h2>
        {subtitle && <p className="text-[14px] leading-[normal] text-muted">{subtitle}</p>}
      </div>
      <div className="py-[6px]">{children}</div>
    </section>
  );
}

function Empty() {
  return <p className="px-[20px] py-[20px] text-[14px] text-muted">No logs this month yet.</p>;
}

function Cell({ children }: { children: React.ReactNode }) {
  return (
    <div role="cell" className="flex min-w-px flex-1 items-center px-[10px] py-[14px]">
      <span className="truncate text-[14px] leading-[normal] text-ink-2">{children}</span>
    </div>
  );
}
