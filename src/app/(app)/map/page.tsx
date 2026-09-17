import type { Metadata } from "next";
import Link from "next/link";
import { FieldMap } from "@/components/field-map";
import { PageHeader } from "@/components/page-header";
import { requireUser } from "@/lib/auth";
import { listFieldsWithCounts } from "@/lib/queries";
import { formatDate } from "@/lib/time";

export const metadata: Metadata = { title: "Map" };

export default async function MapPage() {
  const user = await requireUser();
  const fields = await listFieldsWithCounts(user.farm.id, user.farm.timezone);
  const totalAcres = fields.reduce((a, f) => a + (f.acres ?? 0), 0);

  return (
    <div className="flex flex-col items-center gap-[10px] px-[16px] md:px-[30px] pb-[30px]">
      <PageHeader title="Map" subtitle={`${fields.length} fields · ${Math.round(totalAcres)} acres · ${user.farm.name}`} />
      <div className="flex w-full items-stretch gap-[10px]">
        <div className="h-[640px] min-w-px flex-1 overflow-hidden rounded-[20px] border border-line-2">
          <FieldMap
            fields={fields.map((f) => ({ id: f.id, name: f.name, crop: f.crop, centerLat: f.centerLat, centerLng: f.centerLng, boundary: f.boundary }))}
            interactive
          />
        </div>
        <aside className="flex w-[360px] shrink-0 flex-col overflow-clip rounded-[20px] border border-line-2 bg-surface">
          <div className="border-b border-line-2 px-[20px] py-[16px] text-[16px] leading-[normal] text-ink">
            Fields <span className="text-muted-2">({fields.length})</span>
          </div>
          <ul className="flex-1 overflow-y-auto">
            {fields.map((f) => (
              <li key={f.id} className="border-b border-line-2 last:border-b-0">
                <Link href={`/activity-logs?field=${f.id}`} className="flex items-center justify-between px-[20px] py-[14px] hover:bg-row-hover">
                  <span>
                    <span className="block text-[14px] leading-[normal] text-ink">{f.name}</span>
                    <span className="block text-[14px] leading-[normal] text-muted">
                      {f.crop ?? "—"}
                      {f.acres ? ` · ${f.acres} ac` : ""}
                    </span>
                  </span>
                  <span className="text-right">
                    <span className="block text-[14px] leading-[normal] text-ink-2">{f.logsThisMonth} this month</span>
                    <span className="block text-[14px] leading-[normal] text-muted-2">{f.lastAt ? formatDate(f.lastAt, user.farm.timezone) : "no activity"}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </div>
  );
}
