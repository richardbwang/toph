import type { LucideIcon } from "lucide-react";

/** One of the three figures at the top of the dashboard. */
export function StatCard({
  icon: Icon,
  label,
  value,
  note,
}: {
  icon: LucideIcon;
  label: string;
  value: number | string;
  note?: string;
}) {
  return (
    <div className="flex min-w-px flex-1 flex-col items-start gap-[20px] rounded-[14px] border-[0.88px] border-line-2 p-[20px]">
      <div className="flex items-center gap-[8px]">
        <Icon size={16} className="shrink-0 text-ink" aria-hidden />
        <span className="text-[16px] leading-[normal] whitespace-nowrap text-ink">{label}</span>
      </div>
      <div className="flex items-end gap-[20px]">
        <span className="text-trim text-[48px] leading-[normal] font-medium whitespace-nowrap text-ink">{value}</span>
        {note && <span className="text-[14px] leading-[normal] whitespace-nowrap text-ink opacity-50">{note}</span>}
      </div>
    </div>
  );
}
