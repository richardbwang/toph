"use client";

import { CheckCheck, Flag, RotateCcw, type LucideIcon } from "lucide-react";
import { useOptimistic, useTransition } from "react";
import type { LogStatus } from "@/db/schema";
import { setLogStatus } from "@/lib/actions";

/**
 * Review one log from inside its expanded panel: the manager has just
 * listened and tagged, so the decision belongs here, next to the tags. Uses
 * the same server action as the bulk bar above the table; the status flips
 * optimistically and the server render confirms it (on the dashboard, which
 * lists NEW logs, a reviewed row then leaves the list).
 */
export function ReviewControls({ logId, status, canEdit }: { logId: string; status: LogStatus; canEdit: boolean }) {
  const [pending, startTransition] = useTransition();
  const [shown, show] = useOptimistic(status);

  const set = (next: LogStatus) =>
    startTransition(async () => {
      show(next);
      await setLogStatus([logId], next);
    });

  const label = shown === "NEW" ? "New" : shown === "REVIEWED" ? "Reviewed" : "Flagged";
  const tone = shown === "NEW" ? "bg-green-soft text-green-ink" : shown === "FLAGGED" ? "bg-[#fdecea] text-danger" : "bg-row-hover text-ink-2";

  return (
    <div className="flex w-full flex-wrap items-center gap-[10px] text-[14px] leading-[normal]" aria-live="polite">
      <span className="text-muted">Status</span>
      <span className={`rounded-[80px] px-[12px] py-[6px] ${tone}`}>{label}</span>
      {canEdit && (
        <span className="flex flex-wrap items-center gap-[8px]">
          {shown !== "REVIEWED" && <Chip icon={CheckCheck} label="Mark reviewed" disabled={pending} onClick={() => set("REVIEWED")} />}
          {shown !== "FLAGGED" && <Chip icon={Flag} label="Flag" disabled={pending} onClick={() => set("FLAGGED")} />}
          {shown !== "NEW" && <Chip icon={RotateCcw} label="Mark new" disabled={pending} onClick={() => set("NEW")} />}
        </span>
      )}
    </div>
  );
}

function Chip({ icon: Icon, label, disabled, onClick }: { icon: LucideIcon; label: string; disabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex items-center gap-[6px] rounded-[80px] border border-line-2 bg-surface px-[16px] py-[8px] text-[14px] leading-[normal] whitespace-nowrap text-ink-2 shadow-chip hover:bg-row-hover disabled:opacity-60"
    >
      <Icon size={14} strokeWidth={2} aria-hidden />
      {label}
    </button>
  );
}
