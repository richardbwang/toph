import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Schedule" };

export default async function Page() {
  await requireUser();
  return (
    <div className="flex flex-col items-center gap-[10px] px-[16px] md:px-[30px] pb-[30px]">
      <PageHeader title="Schedule" subtitle="Planned field work by week" />
      <section className="w-full rounded-[20px] border border-line-2 bg-surface px-[30px] py-[30px]">
        <p className="max-w-[640px] text-[14px] leading-[22px] text-ink-2">Scheduling isn&rsquo;t part of the dashboard brief. The natural next step is to turn reviewed logs into a calendar of recurring tasks (spray intervals, irrigation sets) so workers get prompted before they record.</p>
      </section>
    </div>
  );
}
