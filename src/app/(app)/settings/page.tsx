import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { requireUser } from "@/lib/auth";
import { resolveModel } from "@/lib/extract";
import { QUESTIONS } from "@/lib/voice-log";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const user = await requireUser();
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const model = apiKey ? await resolveModel(apiKey) : null;
  const rows: [string, string][] = [
    ["Farm", user.farm.name],
    ["Timezone", user.farm.timezone],
    ["Signed in as", `${user.name} (${user.email})`],
    ["Role", user.role === "ADMIN" ? "Admin — can review, tag and delete logs" : "Worker — can record logs"],
    ["AI extraction", model ? `Claude (${model})` : "Keyword heuristic (set ANTHROPIC_API_KEY to enable Claude)"],
  ];
  return (
    <div className="flex flex-col items-center gap-[10px] px-[16px] md:px-[30px] pb-[30px]">
      <PageHeader title="Settings" subtitle="Farm configuration" />
      <section className="w-full overflow-clip rounded-[20px] border border-line-2 bg-surface">
        {rows.map(([k, v], i) => (
          <div key={k} className={`flex items-center px-[20px] py-[16px] ${i === rows.length - 1 ? "" : "border-b border-line-2"}`}>
            <span className="w-[200px] shrink-0 text-[14px] leading-[normal] text-muted">{k}</span>
            <span className="text-[14px] leading-[normal] text-ink-2">{v}</span>
          </div>
        ))}
      </section>
      <section className="w-full overflow-clip rounded-[20px] border border-line-2 bg-surface">
        <div className="border-b border-line-2 px-[20px] py-[16px] text-[16px] leading-[normal] text-ink">Guided voice log questions</div>
        <ol className="list-decimal py-[6px] pl-[40px] pr-[20px]">
          {QUESTIONS.map((q) => (
            <li key={q.key} className="py-[6px] text-[14px] leading-[normal] text-ink-2">
              {q.text} <span className="text-muted-2">({q.key})</span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
