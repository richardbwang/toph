import type { LucideIcon } from "lucide-react";

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
    <div className="rounded-card border border-line bg-surface px-4 pt-3.5 pb-3.5">
      <div className="flex items-center gap-2 text-[12px] leading-4 text-ink-2">
        <Icon size={14} strokeWidth={1.75} aria-hidden />
        <span>{label}</span>
      </div>
      <div className="mt-1.5 flex items-baseline gap-3">
        <span className="text-[30px] font-semibold leading-9 tracking-[-0.02em] text-ink">{value}</span>
        {note && <span className="text-[11px] leading-4 text-muted">{note}</span>}
      </div>
    </div>
  );
}
