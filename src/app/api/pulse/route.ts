import { and, eq, inArray, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { auditEvents } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * "Has anything changed?" for an open dashboard. Every write to a log — an
 * ingest from a phone, a review, a tag, a delete — appends an audit event and
 * nothing ever removes one, so the farm's audit row count is a version
 * number that only goes up (the newest timestamp alone is not enough: seeded
 * demo events can carry a later time of day than "now"). One index-only
 * query per poll (`audit_events_farm_created_idx`), far cheaper than
 * re-rendering the page on a timer, and no websocket infrastructure.
 */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [row] = await db
    .select({ n: sql<number>`count(*)`, at: sql<string | null>`max(${auditEvents.createdAt})` })
    .from(auditEvents)
    .where(and(eq(auditEvents.farmId, user.farm.id), inArray(auditEvents.entityType, ["activity_log", "recording"])));

  return NextResponse.json({ v: `${row?.n ?? 0}:${row?.at ?? ""}` }, { headers: { "cache-control": "no-store" } });
}
