import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { requireUser } from "@/lib/auth";
import { listAuditEvents } from "@/lib/queries";

export const metadata: Metadata = { title: "Audit Manager" };

const ACTION_LABELS: Record<string, string> = {
  "auth.login": "signed in",
  "log.reviewed": "marked a log as reviewed",
  "log.flagged": "flagged a log",
  "log.new": "moved a log back to new",
  "log.deleted": "deleted a log",
  "log.tag_added": "added a tag",
  "log.tag_removed": "removed a tag",
  "recording.ingested": "filed a voice log",
  "seed.completed": "loaded the demo dataset",
};

/**
 * Chemical-application records are regulated, so every change on the farm is
 * written to an append-only audit table. This page is that table.
 */
export default async function AuditPage() {
  const user = await requireUser();
  const events = await listAuditEvents(user.farm.id);
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: user.farm.timezone,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <div className="flex flex-col items-center gap-[10px] px-[16px] md:px-[30px] pb-[30px]">
      <PageHeader title="Audit Manager" subtitle="Who changed what, and when — append-only" />
      <section className="w-full overflow-clip rounded-[20px] border border-line-2 bg-surface">
        <div role="table" className="w-full">
          <div role="row" className="flex items-center border-b border-line px-[20px]">
            {[
              ["WHEN", "w-[180px]"],
              ["WHO", "w-[220px]"],
              ["ACTION", "flex-1"],
              ["DETAILS", "flex-1"],
            ].map(([h, w]) => (
              <div key={h} role="columnheader" className={`flex ${w} min-w-px items-center px-[10px] py-[20px] opacity-30`}>
                <span className="text-[14px] leading-[normal] whitespace-nowrap text-ink-2">{h}</span>
              </div>
            ))}
          </div>
          {events.length === 0 && <p className="px-[30px] py-[40px] text-center text-[14px] text-muted">Nothing has happened yet.</p>}
          {events.map((e, i) => {
            const meta = (e.meta ?? {}) as Record<string, unknown>;
            const details = Object.entries(meta)
              .filter(([k]) => k !== "recordingId")
              .map(([k, v]) => `${k}: ${String(v)}`)
              .join(" · ");
            return (
              <div key={e.id} role="row" className={`flex items-center px-[20px] ${i === events.length - 1 ? "" : "border-b border-line-2"}`}>
                <Cell className="w-[180px]">{fmt.format(e.createdAt)}</Cell>
                <Cell className="w-[220px]">{e.actor?.name ?? "System"}</Cell>
                <Cell className="flex-1">{ACTION_LABELS[e.action] ?? e.action}</Cell>
                <Cell className="flex-1" muted>
                  {details || `${e.entityType} ${e.entityId.slice(0, 8)}`}
                </Cell>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function Cell({ children, className, muted }: { children: React.ReactNode; className: string; muted?: boolean }) {
  return (
    <div role="cell" className={`flex ${className} min-w-px items-center px-[10px] py-[16px]`}>
      <span className={`truncate text-[14px] leading-[normal] ${muted ? "text-muted" : "text-ink-2"}`}>{children}</span>
    </div>
  );
}
