import "server-only";
import type { ActivityType } from "@/db/schema";
import { ACTIVITY_LABELS } from "@/lib/filters";
import { fromParts, toParts } from "@/lib/time";

/**
 * Turns a worker's spoken answers into a structured activity log.
 *
 * With ANTHROPIC_API_KEY set, Claude does the extraction (the real product
 * pipeline). Without it, a small keyword heuristic keeps the demo working so
 * a reviewer can record a log with zero configuration.
 */

export type Extraction = {
  activity: ActivityType;
  fieldName: string | null;
  product: string | null;
  quantity: number | null;
  unit: string | null;
  startedAt: Date;
  endedAt: Date;
  summary: string;
  responseAccuracy: number; // 0-100
  method: "claude" | "heuristic";
};

export type ExtractInput = {
  answers: { question: string; key: string; answer: string }[];
  capturedAt: Date;
  timezone: string;
  fieldNames: string[];
  transcript: string;
};

const KEYWORDS: [ActivityType, RegExp][] = [
  ["SPRAYING", /\bspray/i],
  ["PEST_CONTROL", /\bpest control|\btrap(s|ping)?\b|\bbait/i],
  ["FERTILIZING", /\bfertili[sz]|\buan\b|nitrogen|potassium|\bnpk\b/i],
  ["SEEDING", /\bseed(ing|ed)\b|\bsow/i],
  ["PLANTING", /\bplant|transplant|cover crop/i],
  ["IRRIGATION", /\birrigat|water(ing|ed)?\b|drip|sprinkler|pivot/i],
  ["HARVESTING", /\bharvest|pick(ing|ed)?\b|shak(ing|er)|\bchop/i],
  ["WEEDING", /\bweed/i],
  ["SOIL_TESTING", /\bsoil (test|sampl)/i],
  ["MONITORING", /\bmonitor|sensor|moisture prob/i],
  ["SCOUTING", /\bscout|inspect|\bpest|check(ing|ed) (the )?(trees|rows|field)/i],
  ["PRUNING", /\bprun|trim|hedg/i],
  ["SOIL_WORK", /\bsoil|disc|disk|till|plow|plough|ripp?ing|cultivat/i],
  ["EQUIPMENT_MAINTENANCE", /\bmaintenance|repair|fix(ed|ing)?\b|service[sd]?\b|tractor|sprayer|nozzle|hydraulic|shop\b/i],
];

export function heuristicExtract(input: ExtractInput): Extraction {
  const text = input.answers.map((a) => a.answer).join(" \n ");
  const activity = KEYWORDS.find(([, re]) => re.test(text))?.[0] ?? "SCOUTING";

  const lower = text.toLowerCase();
  const fieldName =
    input.fieldNames.find((f) => lower.includes(f.toLowerCase())) ??
    (() => {
      const m = lower.match(/\b(?:field|block)\s+([a-z0-9]+)\b/);
      if (!m) return null;
      const guess = `Field ${m[1].toUpperCase()}`;
      return input.fieldNames.find((f) => f.toLowerCase() === guess.toLowerCase()) ?? null;
    })();

  const answered = input.answers.filter((a) => a.answer.trim().split(/\s+/).length >= 2).length;
  const responseAccuracy = Math.round((answered / Math.max(1, input.answers.length)) * 100);

  // Without a reliable time parser, assume the task ended when the log was recorded.
  const endedAt = input.capturedAt;
  const startedAt = new Date(endedAt.getTime() - 90 * 60_000);

  return {
    activity,
    fieldName,
    product: null,
    quantity: null,
    unit: null,
    startedAt,
    endedAt,
    summary: input.transcript,
    responseAccuracy,
    method: "heuristic",
  };
}

type ClaudeResult = {
  activity: string;
  field: string | null;
  product: string | null;
  quantity: number | null;
  unit: string | null;
  start_time: string | null; // "HH:MM" 24h, local
  end_time: string | null;
  summary: string;
  response_accuracy: number;
};

const ANTHROPIC_VERSION = "2023-06-01";
const FALLBACK_MODEL = "claude-sonnet-4-5";
let resolvedModel: Promise<string> | null = null;

/**
 * Which Claude model to call. `ANTHROPIC_MODEL` wins when set; otherwise ask
 * the Models API for the newest Sonnet, so a retired alias never breaks the
 * pipeline. Cached for the life of the server process.
 */
export function resolveModel(apiKey: string): Promise<string> {
  if (process.env.ANTHROPIC_MODEL) return Promise.resolve(process.env.ANTHROPIC_MODEL);
  if (!resolvedModel) {
    resolvedModel = (async () => {
      try {
        const res = await fetch("https://api.anthropic.com/v1/models?limit=100", {
          headers: { "x-api-key": apiKey, "anthropic-version": ANTHROPIC_VERSION },
        });
        if (!res.ok) throw new Error(`models API ${res.status}`);
        const data = (await res.json()) as { data: { id: string; created_at: string }[] };
        const sonnets = data.data
          .filter((m) => /sonnet/i.test(m.id))
          .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
        return sonnets[0]?.id ?? data.data[0]?.id ?? FALLBACK_MODEL;
      } catch (err) {
        console.error("Could not list Claude models, using fallback:", err);
        resolvedModel = null; // don't cache a failure — retry on the next call
        return FALLBACK_MODEL;
      }
    })();
  }
  return resolvedModel;
}

export class ExtractionError extends Error {}

export async function claudeExtract(input: ExtractInput): Promise<Extraction | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  const model = await resolveModel(apiKey);
  const local = toParts(input.capturedAt, input.timezone);

  const system = `You extract structured farm activity logs from a worker's spoken answers to a guided voice log.
Return ONLY a JSON object with these keys:
- activity: one of ${Object.keys(ACTIVITY_LABELS).join(", ")}
- field: one of ${input.fieldNames.map((f) => JSON.stringify(f)).join(", ")} or null if not stated
- product: chemical/fertiliser/seed product name or null
- quantity: number or null
- unit: string or null (e.g. "gal", "lb/acre")
- start_time: "HH:MM" 24-hour local time or null
- end_time: "HH:MM" 24-hour local time or null
- summary: one or two plain sentences a farm manager would want to read
- response_accuracy: integer 0-100 — how many of the questions received a clear, usable answer
The recording was captured at ${String(local.hour).padStart(2, "0")}:${String(local.minute).padStart(2, "0")} local time. Times in the answers are the same day. Never invent facts that were not said.`;

  const user = input.answers.map((a) => `Q (${a.key}): ${a.question}\nA: ${a.answer || "(no answer)"}`).join("\n\n");

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
    },
    body: JSON.stringify({
      model,
      max_tokens: 600,
      system,
      messages: [{ role: "user", content: user }],
    }),
  });
  if (!res.ok) {
    const detail = await res.text();
    console.error("Claude extraction failed:", res.status, detail);
    throw new ExtractionError(`Claude API ${res.status} (${model}): ${detail.slice(0, 200)}`);
  }
  const data = (await res.json()) as { content: { type: string; text?: string }[] };
  const text = data.content.find((c) => c.type === "text")?.text ?? "";
  const json = text.match(/\{[\s\S]*\}/)?.[0];
  if (!json) throw new ExtractionError("Claude returned no JSON");

  let parsed: ClaudeResult;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new ExtractionError("Claude returned malformed JSON");
  }

  const activity = (Object.keys(ACTIVITY_LABELS) as ActivityType[]).find((k) => k === parsed.activity) ?? "SCOUTING";
  const fieldName = input.fieldNames.find((f) => f.toLowerCase() === String(parsed.field ?? "").toLowerCase()) ?? null;

  const timeOn = (hm: string | null, fallback: Date) => {
    const m = hm?.match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return fallback;
    return fromParts({ year: local.year, month: local.month, day: local.day, hour: Number(m[1]), minute: Number(m[2]) }, input.timezone);
  };
  let endedAt = timeOn(parsed.end_time, input.capturedAt);
  let startedAt = timeOn(parsed.start_time, new Date(endedAt.getTime() - 90 * 60_000));
  if (startedAt >= endedAt) {
    startedAt = new Date(endedAt.getTime() - 60 * 60_000);
  }
  if (endedAt > input.capturedAt) endedAt = input.capturedAt;

  return {
    activity,
    fieldName,
    product: parsed.product || null,
    quantity: typeof parsed.quantity === "number" ? parsed.quantity : null,
    unit: parsed.unit || null,
    startedAt,
    endedAt,
    summary: parsed.summary?.trim() || input.transcript,
    responseAccuracy: Math.max(0, Math.min(100, Math.round(Number(parsed.response_accuracy) || 0))),
    method: "claude",
  };
}

/**
 * Claude when configured, the heuristic otherwise — and the heuristic as a
 * safety net if the Claude call fails, with the reason attached so the record
 * page can say why a log was filed without AI.
 */
export async function extractLog(input: ExtractInput): Promise<Extraction & { error?: string }> {
  try {
    const viaClaude = await claudeExtract(input);
    if (viaClaude) return viaClaude;
    return heuristicExtract(input);
  } catch (err) {
    console.error("Claude extraction threw:", err);
    const message = err instanceof Error ? err.message : String(err);
    return { ...heuristicExtract(input), error: message };
  }
}
