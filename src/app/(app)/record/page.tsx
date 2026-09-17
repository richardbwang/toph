import type { Metadata } from "next";
import { Recorder } from "@/components/recorder";
import { PageHeader } from "@/components/page-header";
import { requireUser } from "@/lib/auth";
import { listWorkers } from "@/lib/queries";

export const metadata: Metadata = { title: "Record a voice log" };

/**
 * The worker-side experience, in the browser. On a phone this is the whole
 * "mobile app": tap, answer five questions, done. Admins can file on behalf of
 * a worker, which is also how a reviewer can try the pipeline end to end.
 */
export default async function RecordPage() {
  const user = await requireUser();
  const workers = user.role === "ADMIN" ? (await listWorkers(user.farm.id)).filter((w) => w.status === "ACTIVE") : [];
  return (
    <div className="flex flex-col items-center gap-[10px] px-[16px] md:px-[30px] pb-[30px]">
      <PageHeader title="Record" subtitle="Log field work hands-free — answer a few questions out loud" />
      <Recorder workers={workers.map((w) => ({ id: w.id, name: w.name }))} self={{ id: user.id, name: user.name }} />
    </div>
  );
}
