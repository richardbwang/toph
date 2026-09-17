import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Support" };

export default async function Page() {
  await requireUser();
  return (
    <div className="flex flex-col items-center gap-[10px] px-[16px] md:px-[30px] pb-[30px]">
      <PageHeader title="Support" subtitle="Help and documentation" />
      <section className="w-full rounded-[20px] border border-line-2 bg-surface px-[30px] py-[30px]">
        <p className="max-w-[640px] text-[14px] leading-[22px] text-ink-2">See the README in the repository for setup, the data model and the design decisions behind this build. Demo credentials are on the login page.</p>
      </section>
    </div>
  );
}
