import { and, eq } from "drizzle-orm";
import { type NextRequest } from "next/server";
import { db } from "@/db";
import { recordings } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";

/** GET /api/recordings/:id/audio — streams a recording stored inline in Postgres. */
export async function GET(_req: NextRequest, ctx: RouteContext<"/api/recordings/[id]/audio">) {
  const user = await getSessionUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("Not found", { status: 404 });

  const [rec] = await db
    .select({ audioData: recordings.audioData, mimeType: recordings.mimeType, audioUrl: recordings.audioUrl })
    .from(recordings)
    .where(and(eq(recordings.id, id), eq(recordings.farmId, user.farm.id)));
  if (!rec) return new Response("Not found", { status: 404 });
  if (!rec.audioData) {
    return rec.audioUrl ? Response.redirect(new URL(rec.audioUrl, _req.url), 302) : new Response("No audio", { status: 404 });
  }
  return new Response(new Uint8Array(rec.audioData), {
    headers: {
      "Content-Type": rec.mimeType,
      "Content-Length": String(rec.audioData.byteLength),
      "Cache-Control": "private, max-age=3600",
      "Accept-Ranges": "none",
    },
  });
}
