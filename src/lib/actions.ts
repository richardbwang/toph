"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { activityLogs, auditEvents, logTags, tags, users, type LogStatus } from "@/db/schema";
import { createSession, destroySession, requireUser, verifyPassword } from "@/lib/auth";

/**
 * Server Actions = the write API of the app. Each one is a public POST
 * endpoint, so each one re-authenticates, re-authorises (farm + role) and
 * writes an audit event. The UI re-renders through `revalidatePath`.
 */

export type LoginState = { error?: string } | undefined;

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "");
  if (!email || !password) return { error: "Enter your email and password." };

  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  // Same message for unknown email and wrong password: never confirm which accounts exist.
  if (!user || user.status !== "ACTIVE" || !(await verifyPassword(password, user.passwordHash))) {
    return { error: "Incorrect email or password." };
  }

  await createSession(user.id);
  await db.insert(auditEvents).values({
    farmId: user.farmId,
    actorId: user.id,
    action: "auth.login",
    entityType: "user",
    entityId: user.id,
  });
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard");
}

export async function logout() {
  await destroySession();
  redirect("/login");
}

/** "Switch User": end this session and land on the login page with the account picker open. */
export async function switchUser() {
  await destroySession();
  redirect("/login?switch=1");
}

async function requireAdmin() {
  const user = await requireUser();
  if (user.role !== "ADMIN") throw new Error("Only farm admins can change logs.");
  return user;
}

export async function addTag(logId: string, rawName: string) {
  const user = await requireAdmin();
  const name = rawName.trim().replace(/\s+/g, " ").slice(0, 40);
  if (!name) return { error: "Tag name is empty." };

  const [log] = await db
    .select({ id: activityLogs.id })
    .from(activityLogs)
    .where(and(eq(activityLogs.id, logId), eq(activityLogs.farmId, user.farm.id)));
  if (!log) return { error: "Log not found." };

  // Find-or-create the tag for this farm (case-insensitive match on name).
  const existing = await db
    .select({ id: tags.id, name: tags.name })
    .from(tags)
    .where(eq(tags.farmId, user.farm.id));
  let tag = existing.find((t) => t.name.toLowerCase() === name.toLowerCase());
  if (!tag) {
    [tag] = await db.insert(tags).values({ farmId: user.farm.id, name }).returning({ id: tags.id, name: tags.name });
  }

  await db
    .insert(logTags)
    .values({ logId, tagId: tag.id, createdById: user.id })
    .onConflictDoNothing();
  await db.insert(auditEvents).values({
    farmId: user.farm.id,
    actorId: user.id,
    action: "log.tag_added",
    entityType: "activity_log",
    entityId: logId,
    meta: { tag: tag.name },
  });
  revalidatePath("/", "layout");
  return { ok: true as const, tag };
}

export async function removeTag(logId: string, tagId: string) {
  const user = await requireAdmin();
  const [log] = await db
    .select({ id: activityLogs.id })
    .from(activityLogs)
    .where(and(eq(activityLogs.id, logId), eq(activityLogs.farmId, user.farm.id)));
  if (!log) return { error: "Log not found." };

  const [tag] = await db.select({ name: tags.name }).from(tags).where(eq(tags.id, tagId));
  await db.delete(logTags).where(and(eq(logTags.logId, logId), eq(logTags.tagId, tagId)));
  await db.insert(auditEvents).values({
    farmId: user.farm.id,
    actorId: user.id,
    action: "log.tag_removed",
    entityType: "activity_log",
    entityId: logId,
    meta: { tag: tag?.name },
  });
  revalidatePath("/", "layout");
  return { ok: true as const };
}

export async function setLogStatus(logIds: string[], status: LogStatus) {
  const user = await requireAdmin();
  const ids = [...new Set(logIds)].slice(0, 500);
  if (!ids.length) return { ok: true as const, updated: 0 };

  const reviewed = status !== "NEW";
  const updated = await db
    .update(activityLogs)
    .set({
      status,
      reviewedAt: reviewed ? new Date() : null,
      reviewedById: reviewed ? user.id : null,
    })
    .where(and(eq(activityLogs.farmId, user.farm.id), inArray(activityLogs.id, ids)))
    .returning({ id: activityLogs.id });

  if (updated.length) {
    await db.insert(auditEvents).values(
      updated.map((row) => ({
        farmId: user.farm.id,
        actorId: user.id,
        action: `log.${status.toLowerCase()}`,
        entityType: "activity_log",
        entityId: row.id,
      })),
    );
  }
  revalidatePath("/", "layout");
  return { ok: true as const, updated: updated.length };
}

export async function deleteLogs(logIds: string[]) {
  const user = await requireAdmin();
  const ids = [...new Set(logIds)].slice(0, 500);
  if (!ids.length) return { ok: true as const, deleted: 0 };
  const deleted = await db
    .delete(activityLogs)
    .where(and(eq(activityLogs.farmId, user.farm.id), inArray(activityLogs.id, ids)))
    .returning({ id: activityLogs.id });
  if (deleted.length) {
    await db.insert(auditEvents).values(
      deleted.map((row) => ({
        farmId: user.farm.id,
        actorId: user.id,
        action: "log.deleted",
        entityType: "activity_log",
        entityId: row.id,
      })),
    );
  }
  revalidatePath("/", "layout");
  return { ok: true as const, deleted: deleted.length };
}
