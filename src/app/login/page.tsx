import type { Metadata } from "next";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage(props: PageProps<"/login">) {
  const params = await props.searchParams;
  const next = typeof params.next === "string" ? params.next : "";
  const switching = params.switch === "1";

  // Demo convenience: list the seeded accounts so reviewers can jump in.
  const accounts = await db
    .select({ name: users.name, email: users.email, role: users.role, avatarUrl: users.avatarUrl })
    .from(users)
    .where(eq(users.status, "ACTIVE"))
    .orderBy(asc(users.role), asc(users.name))
    .limit(6);

  return (
    <main className="flex min-h-full items-center justify-center bg-row-hover px-4 py-12">
      <div className="w-full max-w-[400px]">
        <div className="mb-8 flex items-center gap-2.5">
          <span className="grid size-9 place-items-center rounded-[10px] bg-chip text-chip-ink">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M2 10v3M6 6v11M10 3v18M14 8v7M18 5v13M22 10v3" />
            </svg>
          </span>
          <span className="text-[20px] font-semibold tracking-[-0.01em]">Toph</span>
        </div>
        <div className="rounded-[14px] border border-line bg-surface p-7 shadow-chip">
          <h1 className="text-[20px] font-semibold tracking-[-0.01em]">{switching ? "Switch user" : "Sign in"}</h1>
          <p className="mt-1 text-[13px] text-muted">
            {switching ? "Choose an account to continue." : "Farm activity, transcribed from the field."}
          </p>
          <LoginForm next={next} accounts={accounts} />
        </div>
        <p className="mt-6 text-center text-[12px] text-muted">
          Demo password for every account: <code className="rounded bg-nav-active px-1.5 py-0.5 text-ink-2">toph-demo</code>
        </p>
      </div>
    </main>
  );
}
