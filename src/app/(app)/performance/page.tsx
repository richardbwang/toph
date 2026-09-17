import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { requireUser } from "@/lib/auth";
import { listWorkersWithStats } from "@/lib/queries";

export const metadata: Metadata = { title: "Performance" };

/** Response accuracy per worker this month — the number behind the dashboard's "90". */
export default async function PerformancePage() {
  const user = await requireUser();
  const workers = (await listWorkersWithStats(user.farm.id, user.farm.timezone))
    .filter((w) => w.status === "ACTIVE")
    .sort((a, b) => (b.accuracy ?? -1) - (a.accuracy ?? -1) || b.logsThisMonth - a.logsThisMonth);
  const rated = workers.filter((w) => w.accuracy != null);
  const avg = rated.length ? Math.round(rated.reduce((a, w) => a + (w.accuracy ?? 0), 0) / rated.length) : null;

  return (
    <div className="flex flex-col items-center gap-[10px] px-[16px] md:px-[30px] pb-[30px]">
      <PageHeader title="Performance" subtitle="How clearly each worker answers the guided questions this month" />
      <section className="w-full overflow-clip rounded-[20px] border border-line-2 bg-surface">
        <div className="flex items-center justify-between border-b border-line-2 px-[20px] py-[16px]">
          <h2 className="text-[16px] leading-[normal] text-ink">
            Response accuracy <span className="text-muted-2">({rated.length} workers with logs)</span>
          </h2>
          <span className="text-[14px] leading-[normal] text-muted">Farm average: {avg == null ? "—" : `${avg}%`}</span>
        </div>
        <div className="py-[6px]">
          {workers.map((w) => (
            <div key={w.id} className="flex items-center gap-[12px] px-[20px] py-[10px]">
              <span className="w-[180px] shrink-0 truncate text-[14px] leading-[normal] text-ink-2">{w.name}</span>
              <span className="h-[8px] flex-1 overflow-hidden rounded-[4px] bg-line-2">
                <span className="block h-full rounded-[4px] bg-wave" style={{ width: `${w.accuracy ?? 0}%` }} />
              </span>
              <span className="w-[60px] shrink-0 text-right text-[14px] leading-[normal] text-ink-2">{w.accuracy == null ? "—" : `${w.accuracy}%`}</span>
              <span className="w-[90px] shrink-0 text-right text-[14px] leading-[normal] text-muted">
                {w.logsThisMonth} log{w.logsThisMonth === 1 ? "" : "s"}
              </span>
            </div>
          ))}
        </div>
      </section>
      <p className="w-full text-[14px] leading-[normal] text-muted">
        Accuracy is the share of guided questions that received a usable answer, scored when the recording is transcribed. A worker who
        says &ldquo;I don&rsquo;t remember&rdquo; to three of five questions scores 40.
      </p>
    </div>
  );
}
