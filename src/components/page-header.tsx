import type { ReactNode } from "react";

/** Title + subtitle on the left, an optional control (search) on the right. */
export function PageHeader({ title, subtitle, children }: { title: string; subtitle: string; children?: ReactNode }) {
  return (
    <header className="flex w-full flex-wrap items-center justify-between gap-[10px] py-[20px]">
      <div className="flex min-w-0 flex-col items-start leading-[normal] md:whitespace-nowrap">
        <h1 className="text-[20px] font-semibold text-ink">{title}</h1>
        <p className="text-[16px] text-ink-2">{subtitle}</p>
      </div>
      {children}
    </header>
  );
}
