/**
 * The guided voice log: the questions the mobile app asks a worker, and the
 * transcript format Toph stores (the same format the design shows under
 * "Summary"). Shared by the seed data, the record page and the ingest API.
 */
export const QUESTIONS = [
  {
    key: "activity_type",
    text: "What type of activity was this — spraying, fertilizing, planting, irrigating, harvesting, scouting, pruning, soil work, or equipment maintenance?",
  },
  { key: "field_block", text: "Where were you working (field, block, or area)?" },
  { key: "product", text: "Did you apply any product? If so, what and how much?" },
  { key: "time_range", text: "When did you start and when did you finish?" },
  { key: "notes", text: "Anything else worth noting?" },
] as const;

export type QuestionKey = (typeof QUESTIONS)[number]["key"];

/** Builds the "Offline guided voice log" transcript. */
export function buildTranscript(createdAtIso: string, answers: string[]) {
  const qa = QUESTIONS.slice(0, answers.length)
    .map((q, i) => `Question (${q.key}): ${q.text} Answer: ${answers[i] || "(no answer)"}`)
    .join(" ");
  return `"Offline guided voice log created at ${createdAtIso}. ${qa}`;
}
