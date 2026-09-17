"use client";

import { Star, X } from "lucide-react";
import { useOptimistic, useState, useTransition } from "react";
import { addTag, removeTag } from "@/lib/actions";

type Tag = { id: string; name: string };

/**
 * "Add Tag" — the one write on the expanded row. Tags are persisted through a
 * server action; `useOptimistic` shows the new chip immediately and the
 * server render that follows confirms (or reverts) it.
 */
export function TagEditor({
  logId,
  tags,
  suggestions,
  canEdit,
}: {
  logId: string;
  tags: Tag[];
  suggestions: Tag[];
  canEdit: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [optimistic, mutate] = useOptimistic(tags, (state, change: { type: "add"; tag: Tag } | { type: "remove"; id: string }) =>
    change.type === "add" ? [...state.filter((t) => t.name.toLowerCase() !== change.tag.name.toLowerCase()), change.tag] : state.filter((t) => t.id !== change.id),
  );

  const submit = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setError(null);
    setValue("");
    setEditing(false);
    startTransition(async () => {
      mutate({ type: "add", tag: { id: `optimistic-${trimmed}`, name: trimmed } });
      const res = await addTag(logId, trimmed);
      if (res && "error" in res && res.error) setError(res.error);
    });
  };

  const remove = (tag: Tag) => {
    startTransition(async () => {
      mutate({ type: "remove", id: tag.id });
      await removeTag(logId, tag.id);
    });
  };

  const unused = suggestions.filter((s) => !optimistic.some((t) => t.name.toLowerCase() === s.name.toLowerCase()));
  const buttonBase =
    "flex w-full items-center justify-center gap-[10px] rounded-[7.04px] border border-green-soft bg-green-soft px-[8.8px] py-[10.56px] text-[16px] leading-[normal] text-green-ink";

  return (
    <div className="w-full">
      {editing ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit(value);
          }}
          className={`${buttonBase} justify-start`}
        >
          <Star size={16} className="shrink-0" aria-hidden />
          <input
            autoFocus
            list={`tags-${logId}`}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && setEditing(false)}
            onBlur={() => !value && setEditing(false)}
            placeholder="Type a tag and press Enter…"
            maxLength={40}
            className="min-w-0 flex-1 bg-transparent text-[16px] leading-[normal] text-green-ink placeholder:text-green-ink/60 outline-none"
          />
          <datalist id={`tags-${logId}`}>
            {unused.map((s) => (
              <option key={s.id} value={s.name} />
            ))}
          </datalist>
          <button type="submit" className="rounded-[4px] bg-green-ink px-[10px] py-[4px] text-[14px] leading-[normal] text-white hover:brightness-95">
            Add
          </button>
        </form>
      ) : (
        <button type="button" disabled={!canEdit || pending} onClick={() => setEditing(true)} className={`${buttonBase} hover:brightness-[0.97] disabled:opacity-60`}>
          <Star size={16} aria-hidden />
          Add Tag
        </button>
      )}

      {optimistic.length > 0 && (
        <ul className="mt-[10px] flex flex-wrap gap-[8px]" aria-label="Tags">
          {optimistic.map((t) => (
            <li
              key={t.id}
              className="flex items-center gap-[6px] rounded-[80px] border border-line bg-surface py-[4px] pr-[6px] pl-[12px] text-[14px] leading-[normal] text-ink-2 shadow-chip"
            >
              {t.name}
              {canEdit ? (
                <button type="button" onClick={() => remove(t)} aria-label={`Remove tag ${t.name}`} className="rounded-full p-[2px] text-muted hover:bg-row-hover hover:text-ink">
                  <X size={12} />
                </button>
              ) : (
                <span className="w-[6px]" />
              )}
            </li>
          ))}
        </ul>
      )}
      {error && <p className="mt-[6px] text-[14px] text-danger">{error}</p>}
    </div>
  );
}
