import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Messages" };

export default async function Page() {
  await requireUser();
  return (
    <div className="flex flex-col items-center gap-[10px] px-[16px] md:px-[30px] pb-[30px]">
      <PageHeader title="Messages" subtitle="Notes between managers and workers" />
      <section className="w-full rounded-[20px] border border-line-2 bg-surface px-[30px] py-[30px]">
        <p className="max-w-[640px] text-[14px] leading-[22px] text-ink-2">Messaging isn&rsquo;t part of the dashboard brief. The Inbox icon in the sidebar links here; a real implementation would attach threads to individual logs so a manager can ask a worker to clarify an answer.</p>
      </section>
    </div>
  );
}
