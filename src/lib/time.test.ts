import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { addDays, formatTimeRange, fromParts, resolveSpokenRange, startOfDay, startOfMonth, toParts } from "./time";

/**
 * The timezone helpers are the one place a wrong answer looks plausible —
 * a log two hours off, "today" bleeding into yesterday — so they get tests.
 * Run with `npm test`.
 */

const tz = "America/Los_Angeles";
const at = (y: number, m: number, d: number, h = 0, mi = 0) => fromParts({ year: y, month: m, day: d, hour: h, minute: mi }, tz);
const wall = (d: Date) => {
  const p = toParts(d, tz);
  return `${p.month}/${p.day} ${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`;
};

describe("fromParts / toParts", () => {
  it("round-trips a wall-clock time across DST", () => {
    for (const d of [at(2026, 1, 15, 6, 30), at(2026, 7, 4, 23, 59), at(2026, 3, 8, 3, 0), at(2026, 11, 1, 1, 30)]) {
      const p = toParts(d, tz);
      assert.equal(fromParts(p, tz).getTime(), d.getTime());
    }
  });

  it("stores instants, not wall-clock: 6:00 AM in California is 13:00 UTC in summer", () => {
    assert.equal(at(2026, 9, 16, 6, 0).toISOString(), "2026-09-16T13:00:00.000Z");
  });
});

describe("day and month windows", () => {
  it("startOfDay is local midnight even though the server runs in UTC", () => {
    // 2026-09-17 02:00 UTC is still Sept 16 in California.
    const d = new Date("2026-09-17T02:00:00Z");
    assert.equal(wall(startOfDay(d, tz)), "9/16 00:00");
  });

  it("addDays keeps the wall-clock time across the DST change", () => {
    assert.equal(wall(addDays(at(2026, 10, 31, 9, 0), 2, tz)), "11/2 09:00");
  });

  it("startOfMonth", () => {
    assert.equal(wall(startOfMonth(at(2026, 9, 16, 12, 0), tz)), "9/1 00:00");
  });
});

describe("resolveSpokenRange", () => {
  const cases: [string, string | null, string | null, Date, string, string][] = [
    ["a log filed at 12:21 AM about 10:00–12:00 is about yesterday", "10:00", "12:00", at(2026, 9, 17, 0, 21), "9/16 10:00", "9/16 12:00"],
    ["afternoon log about the morning", "06:00", "10:40", at(2026, 9, 16, 14, 0), "9/16 06:00", "9/16 10:40"],
    ["overnight shift filed at 3 AM crosses midnight", "22:00", "02:00", at(2026, 9, 17, 3, 0), "9/16 22:00", "9/17 02:00"],
    ["end later than now means yesterday", "13:00", "17:00", at(2026, 9, 17, 9, 0), "9/16 13:00", "9/16 17:00"],
    ["month boundary", "15:00", "18:00", at(2026, 10, 1, 0, 30), "9/30 15:00", "9/30 18:00"],
    ["no end → the recording time", "08:00", null, at(2026, 9, 16, 9, 30), "9/16 08:00", "9/16 09:30"],
    ["no start → 90 minutes before the end", null, "11:00", at(2026, 9, 16, 12, 0), "9/16 09:30", "9/16 11:00"],
    ["nothing → 90 minutes ending now", null, null, at(2026, 9, 16, 12, 0), "9/16 10:30", "9/16 12:00"],
    ["start == end is garbled → 90-minute window", "10:00", "10:00", at(2026, 9, 16, 12, 0), "9/16 08:30", "9/16 10:00"],
    ["a 23-hour span is garbled → 90-minute window", "09:00", "08:00", at(2026, 9, 16, 14, 0), "9/16 06:30", "9/16 08:00"],
    ["unparseable strings are ignored", "25:00", "9:99", at(2026, 9, 16, 12, 0), "9/16 10:30", "9/16 12:00"],
    ["DST end day", "06:00", "08:00", at(2026, 11, 1, 9, 0), "11/1 06:00", "11/1 08:00"],
  ];
  for (const [name, start, end, captured, wantStart, wantEnd] of cases) {
    it(name, () => {
      const r = resolveSpokenRange(start, end, captured, tz);
      assert.equal(`${wall(r.startedAt)} → ${wall(r.endedAt)}`, `${wantStart} → ${wantEnd}`);
      assert.ok(r.endedAt <= captured, "never in the future");
      assert.ok(r.startedAt < r.endedAt, "start before end");
    });
  }
});

describe("formatTimeRange", () => {
  it("matches the dashboard's '6:00 AM - 10:40 AM' style", () => {
    assert.equal(formatTimeRange(at(2026, 9, 16, 6, 0), at(2026, 9, 16, 10, 40), tz), "6:00 AM - 10:40 AM");
  });
});
