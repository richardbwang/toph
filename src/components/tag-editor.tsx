"use client";

import { Star, X } from "lucide-react";
import { useOptimistic, useRef, useState, useTransition } from "react";
import { addTag, removeTag } from "@/lib/actions";

type Tag = { id: string; name: string };

/**
 * "Add Tag" — the one write on the expanded row. Tags are persisted through
 * a server action; `useOptimistic` shows the new chip immediately and the
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
  const inputRef = useRef<HTMLInputElement>(null);
  const [optimistic, mutate] = useOptimistic(tags, (state, change: { type: "add"; tag: Tag } | { type: "remove"; id: string }) =>
    change.type === "add" ? [...state.filter((t) => t.id !== change.tag.id), change.tag] : state.filter((t) => t.id !== change.id),
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

  return (
    <div>
      {editing ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit(value);
          }}
          className="flex h-8 items-center gap-1.5 rounded-[8px] border border-green bg-green-soft pr-1 pl-2.5"
        >
          <Star size={13} strokeWidth={2} className="shrink-0 text-green-ink" aria-hidden />
          <input
            ref={inputRef}
            autoFocus
            list={`tags-${logId}`}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && setEditing(false)}
            onBlur={() => !value && setEditing(false)}
            placeholder="Tag name…"
            maxLength={40}
            className="h-full min-w-0 flex-1 bg-transparent text-[12px] text-green-ink placeholder:text-green-ink/60 outline-none"
          />
          <datalist id={`tags-${logId}`}>
            {unused.map((s) => (
              <option key={s.id} value={s.name} />
            ))}
          </datalist>
          <button type="submit" className="h-6 rounded-md bg-green px-2 text-[11px] font-medium text-white hover:brightness-95">
            Add
          </button>
        </form>
      ) : (
        <button
          type="button"
          disabled={!canEdit || pending}
          onClick={() => setEditing(true)}
          className="flex h-8 w-full items-center justify-center gap-1.5 rounded-[8px] bg-green-soft text-[12px] font-medium text-green-ink hover:brightness-[0.98] disabled:opacity-60"
        >
          <Star size={13} strokeWidth={2} aria-hidden />
          Add Tag
        </button>
      )}

      {optimistic.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Tags">
          {optimistic.map((t) => (
            <li key={t.id} className="inline-flex h-6 items-center gap-1 rounded-chip border border-line bg-surface pr-1.5 pl-2 text-[11px] font-medium text-ink-2">
              {t.name}
              {canEdit && (
                <button type="button" onClick={() => remove(t)} aria-label={`Remove tag ${t.name}`} className="rounded-full p-0.5 text-muted hover:bg-hover hover:text-ink">
                  <X size={10} strokeWidth={2.5} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {error && <p className="mt-1 text-[11px] text-[#c62828]">{error}</p>}
    </div>
  );
}
