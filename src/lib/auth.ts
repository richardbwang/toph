import "server-only";
import bcrypt from "bcryptjs";
import { and, eq, gt } from "drizzle-orm";
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { db } from "@/db";
import { farms, sessions, users } from "@/db/schema";
import { SESSION_COOKIE } from "@/lib/session-cookie";

/**
 * Session-based authentication, written by hand on purpose.
 *
 * Why not NextAuth / Clerk? For a single-tenant dashboard with seeded
 * accounts, a 100-line implementation is easier to reason about (and to
 * defend) than a framework whose defaults we would have to override anyway:
 *
 *   1. The browser holds an opaque 256-bit random token in an httpOnly,
 *      SameSite=Lax cookie — JavaScript can never read it (XSS-safe), and
 *      cross-site POSTs don't carry it (CSRF-safe for our server actions).
 *   2. The database stores only SHA-256(token). A leaked DB dump cannot be
 *      replayed as a login, and revoking a session is a single DELETE.
 *   3. Passwords are bcrypt-hashed (cost 10). Verification is constant-time.
 *   4. Every request re-checks the session row, so "Log Out" is immediate and
 *      role changes take effect without waiting for a JWT to expire.
 */

export { SESSION_COOKIE };
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string | null) {
  if (!hash) return false;
  return bcrypt.compare(password, hash);
}

/** Creates a session row and sets the cookie. Call from a Server Action only. */
export async function createSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.insert(sessions).values({ userId, tokenHash: hashToken(token), expiresAt });
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

/** Deletes the current session row and clears the cookie. */
export async function destroySession() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) await db.delete(sessions).where(eq(sessions.tokenHash, hashToken(token)));
  store.delete(SESSION_COOKIE);
}

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  role: "ADMIN" | "WORKER";
  avatarUrl: string | null;
  farm: { id: string; name: string; timezone: string };
};

/**
 * The signed-in user for this request, or null. Wrapped in React's `cache()`
 * so the layout, the page and every server action in one request share a
 * single database round-trip.
 */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const [row] = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      avatarUrl: users.avatarUrl,
      farmId: farms.id,
      farmName: farms.name,
      farmTimezone: farms.timezone,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .innerJoin(farms, eq(users.farmId, farms.id))
    .where(and(eq(sessions.tokenHash, hashToken(token)), gt(sessions.expiresAt, new Date())))
    .limit(1);

  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    avatarUrl: row.avatarUrl,
    farm: { id: row.farmId, name: row.farmName, timezone: row.farmTimezone },
  };
});

/** Use in layouts/pages/actions that must not run for anonymous visitors. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) {
    // A cookie that no longer matches a session row (expired, logged out
    // elsewhere, or the database was reseeded) gets a "signed out" note
    // instead of a silent bounce. The cookie itself is replaced on next login.
    const store = await cookies();
    redirect(store.get(SESSION_COOKIE)?.value ? "/login?expired=1" : "/login");
  }
  return user;
}
