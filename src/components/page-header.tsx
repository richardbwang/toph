import type { ReactNode } from "react";

/** Title + subtitle on the left, an optional control (search) on the right. */
export function PageHeader({ title, subtitle, children }: { title: string; subtitle: string; children?: ReactNode }) {
  return (
    <header className="flex w-full items-center justify-between py-[20px]">
      <div className="flex flex-col items-start leading-[normal] whitespace-nowrap">
        <h1 className="text-[20px] font-semibold text-ink">{title}</h1>
        <p className="text-[16px] text-ink-2">{subtitle}</p>
      </div>
      {children}
    </header>
  );
}
