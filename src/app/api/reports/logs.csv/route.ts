import { type NextRequest } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { exportLogs } from "@/lib/queries";
import { startOfMonth, startOfNextMonth, toParts } from "@/lib/time";

/** GET /api/reports/logs.csv?period=month|all — the month's logs as a spreadsheet. */
export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const tz = user.farm.timezone;
  const period = req.nextUrl.searchParams.get("period") ?? "month";
  const now = new Date();
  const from = period === "month" ? startOfMonth(now, tz) : null;
  const to = period === "month" ? startOfNextMonth(now, tz) : null;
  const rows = await exportLogs(user.farm.id, from, to);

  const local = (d: Date) => {
    const p = toParts(d, tz);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${p.year}-${pad(p.month)}-${pad(p.day)} ${pad(p.hour)}:${pad(p.minute)}`;
  };
  const esc = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = ["id", "worker", "activity", "field", "started_at", "ended_at", "product", "quantity", "unit", "response_accuracy", "status", "summary"];
  const lines = [header.join(",")];
  for (const r of rows) {
    lines.push(
      [r.id, r.worker, r.activity, r.field, local(r.startedAt), local(r.endedAt), r.product, r.quantity, r.unit, r.responseAccuracy, r.status, r.summary]
        .map(esc)
        .join(","),
    );
  }
  const p = toParts(now, tz);
  const name = period === "month" ? `toph-logs-${p.year}-${String(p.month).padStart(2, "0")}.csv` : "toph-logs-all.csv";
  return new Response(lines.join("\n") + "\n", {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "no-store",
    },
  });
}
