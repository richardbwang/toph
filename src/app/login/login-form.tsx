"use client";

import { useActionState, useState } from "react";
import { login, type LoginState } from "@/lib/actions";

type Account = { name: string; email: string; role: "ADMIN" | "WORKER"; avatarUrl: string | null };

export function LoginForm({ next, accounts }: { next: string; accounts: Account[] }) {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(login, undefined);
  const [email, setEmail] = useState(accounts[0]?.email ?? "");

  return (
    <form action={formAction} className="mt-6 space-y-4">
      <input type="hidden" name="next" value={next} />

      {accounts.length > 0 && (
        <div>
          <span className="mb-1.5 block text-[12px] font-medium text-muted">Accounts on this farm</span>
          <div className="grid grid-cols-2 gap-1.5">
            {accounts.map((a) => (
              <button
                key={a.email}
                type="button"
                onClick={() => setEmail(a.email)}
                aria-pressed={email === a.email}
                className="flex items-center gap-2 rounded-[8px] border border-line px-2.5 py-2 text-left text-[13px] hover:bg-hover aria-pressed:border-ink aria-pressed:bg-selected"
              >
                <span className="grid size-6 shrink-0 place-items-center rounded-full bg-selected text-[11px] font-semibold text-ink-2">
                  {a.name.slice(0, 1)}
                </span>
                <span className="min-w-0">
                  <span className="block truncate font-medium">{a.name}</span>
                  <span className="block text-[11px] text-muted">{a.role === "ADMIN" ? "Admin" : "Worker"}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      <label className="block">
        <span className="mb-1.5 block text-[12px] font-medium text-muted">Email</span>
        <input
          name="email"
          type="email"
          autoComplete="username"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="h-10 w-full rounded-[8px] border border-line bg-surface px-3 text-[14px] outline-none focus:border-ink"
        />
      </label>
      <label className="block">
        <span className="mb-1.5 block text-[12px] font-medium text-muted">Password</span>
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          defaultValue=""
          className="h-10 w-full rounded-[8px] border border-line bg-surface px-3 text-[14px] outline-none focus:border-ink"
        />
      </label>

      {state?.error && (
        <p role="alert" className="text-[13px] text-[#c62828]">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="h-10 w-full rounded-[8px] bg-chip text-[14px] font-medium text-chip-ink hover:bg-black disabled:opacity-60"
      >
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
