/**
 * Deterministic demo dataset for Bays Ranch.
 *
 * Dates are expressed relative to "today" (in the farm's timezone) so the
 * dashboard always looks alive: the four NEW logs land on the last four days,
 * five recordings are stamped today, and the accuracy figures average to 90.
 *
 * The same module feeds two scripts:
 *   - scripts/gen-audio.ts   synthesises one clip per recording (+ waveform peaks)
 *   - src/db/seed.ts         inserts everything into Postgres
 */
import type { ActivityType } from "./schema";
import { buildTranscript, QUESTIONS } from "@/lib/voice-log";

export { buildTranscript, QUESTIONS };

export const FARM = { name: "Bays Ranch", timezone: "America/Los_Angeles" };

export const ADMIN = {
  name: "Bays Ranch",
  email: "admin@baysranch.com",
  password: "toph-demo",
  avatarUrl: "/avatars/admin.jpg",
};

/** Field workers. `voice` picks a TTS voice so the demo clips differ. */
export const WORKERS: { name: string; email: string; voice: string; status?: "ACTIVE" | "INACTIVE" }[] = [
  { name: "Isaac Wang", email: "isaac@baysranch.com", voice: "m1" },
  { name: "Maya Patel", email: "maya@baysranch.com", voice: "f1" },
  { name: "Liam Johnson", email: "liam@baysranch.com", voice: "m2" },
  { name: "Sophia Lee", email: "sophia@baysranch.com", voice: "f2" },
  { name: "Mateo Alvarez", email: "mateo@baysranch.com", voice: "m3" },
  { name: "Grace Kim", email: "grace@baysranch.com", voice: "f1" },
  { name: "Noah Williams", email: "noah@baysranch.com", voice: "m1" },
  { name: "Ava Nguyen", email: "ava@baysranch.com", voice: "f2" },
  { name: "Ethan Brown", email: "ethan@baysranch.com", voice: "m2" },
  { name: "Chloe Martinez", email: "chloe@baysranch.com", voice: "f1" },
  { name: "Lucas Garcia", email: "lucas@baysranch.com", voice: "m3" },
  { name: "Emma Davis", email: "emma@baysranch.com", voice: "f2" },
  // Left the farm — not counted as an active worker.
  { name: "Ben Carter", email: "ben@baysranch.com", voice: "m1", status: "INACTIVE" },
];

/** Rectangular blocks laid out on real farmland east of Oakdale, CA. */
/** Half-sizes in degrees for a ~40-acre square block at 37.8°N (1° lat ≈ 111 km, 1° lng ≈ 88 km). */
function block(name: string, crop: string, acres: number, lat: number, lng: number) {
  const side = Math.sqrt(acres * 4046.86); // metres
  const dLat = side / 2 / 111_000;
  const dLng = side / 2 / (111_000 * Math.cos((lat * Math.PI) / 180));
  const ring: [number, number][] = [
    [lng - dLng, lat - dLat],
    [lng + dLng, lat - dLat],
    [lng + dLng, lat + dLat],
    [lng - dLng, lat + dLat],
    [lng - dLng, lat - dLat],
  ];
  return {
    name,
    crop,
    acres,
    centerLat: lat,
    centerLng: lng,
    boundary: { type: "Polygon", coordinates: [ring] } as GeoJSON.Polygon,
  };
}

export const FIELDS = [
  block("Field A", "Almonds", 42, 37.8062, -120.8492),
  block("Field B", "Walnuts", 38, 37.8062, -120.8422),
  block("Field C", "Tomatoes", 55, 37.8012, -120.8492),
  block("Field D", "Alfalfa", 47, 37.8012, -120.8422),
  block("Field E", "Pistachios", 31, 37.8112, -120.8457),
  block("Field F", "Corn (silage)", 60, 37.7962, -120.8457),
];

export const TAGS = ["Needs follow-up", "Chemical application", "Weather delay", "Equipment issue", "Verified on site"];

export type SeedLog = {
  /** stable id used for the audio filename */
  key: string;
  worker: string; // worker name
  activity: ActivityType;
  field: string | null;
  /** days before today (0 = today) */
  daysAgo: number;
  start: string; // "HH:MM" local
  end: string; // "HH:MM" local
  product?: string;
  quantity?: number;
  unit?: string;
  responseAccuracy: number;
  status: "NEW" | "REVIEWED" | "FLAGGED";
  /** The worker's spoken answers, in order — this is what gets synthesised. */
  answers: string[];
  /** Override the auto-generated transcript (used for the row copied from the design). */
  transcript?: string;
  tags?: string[];
};

const DESIGN_TRANSCRIPT_TAIL =
  `Question (activity_type): What type of activity was this — spraying, fertilizing, planting, irrigating, harvesting, scouting, pruning, soil work, or equipment maintenance? Answer: I'm leaving first, I'm going to go home. Question (field_block): Where were you working (field, block, or area)? Answer: yes, in one part and then 130 and 200 yes, and 130 for uh 160 and no, this yes no, no, uhm no no I remember, uhm uhm uhm, no, I don't remember anything.`;

export const DESIGN_TRANSCRIPT_PREFIX = '"Offline guided voice log created at ';
export { DESIGN_TRANSCRIPT_TAIL };

// ───────────────────────────── The four NEW logs (the design's table) ─────────────────────────────

export const NEW_LOGS: SeedLog[] = [
  {
    key: "new-isaac",
    worker: "Isaac Wang",
    activity: "SPRAYING",
    field: "Field A",
    daysAgo: 3,
    start: "06:00",
    end: "10:40",
    product: "Copper fungicide",
    quantity: 12,
    unit: "gal",
    responseAccuracy: 96,
    status: "NEW",
    answers: [
      "I'm leaving first, I'm going to go home.",
      "yes, in one part and then 130 and 200 yes, and 130 for uh 160 and no, this yes no, no, uhm no no I remember, uhm uhm uhm, no, I don't remember anything.",
    ],
    // Copied verbatim from the design so the expanded row matches it.
    transcript: DESIGN_TRANSCRIPT_TAIL,
  },
  {
    key: "new-maya",
    worker: "Maya Patel",
    activity: "HARVESTING",
    field: "Field B",
    daysAgo: 2,
    start: "07:30",
    end: "11:15",
    responseAccuracy: 88,
    status: "NEW",
    answers: [
      "Harvesting. We shook the walnut rows on the east side.",
      "Field B, the walnut block by the canal road.",
      "No product, just the shaker and the sweeper.",
      "Started at seven thirty, finished around eleven fifteen.",
      "Two bins were overflowing so we left them by the gate for pickup.",
    ],
  },
  {
    key: "new-liam",
    worker: "Liam Johnson",
    activity: "PLANTING",
    field: "Field C",
    daysAgo: 1,
    start: "08:00",
    end: "12:00",
    product: "Tomato transplants (Heinz 1015)",
    quantity: 4800,
    unit: "plants",
    responseAccuracy: 91,
    status: "NEW",
    answers: [
      "Planting, tomato transplants.",
      "Field C, rows one through twenty on the south end.",
      "About forty eight hundred Heinz ten fifteen transplants.",
      "Eight in the morning until noon.",
      "The transplanter skipped a few spots near the pump, we filled those by hand.",
    ],
  },
  {
    key: "new-sophia",
    worker: "Sophia Lee",
    activity: "IRRIGATION",
    field: "Field D",
    daysAgo: 0,
    start: "06:30",
    end: "09:30",
    responseAccuracy: 85,
    status: "NEW",
    answers: [
      "Irrigating.",
      "Field D, the alfalfa.",
      "No product.",
      "Six thirty to nine thirty.",
      "Check three had low pressure again, I think the filter needs cleaning.",
    ],
  },
];

// ───────────────────────────── Other recordings from today ─────────────────────────────
// Together with Sophia's these make "5 recordings today, 1 new".

export const TODAY_LOGS: SeedLog[] = [
  {
    key: "today-mateo",
    worker: "Mateo Alvarez",
    activity: "SCOUTING",
    field: "Field E",
    daysAgo: 0,
    start: "05:50",
    end: "07:10",
    responseAccuracy: 93,
    status: "REVIEWED",
    answers: [
      "Scouting.",
      "Field E, the pistachios.",
      "No product.",
      "Five fifty to about seven ten.",
      "Saw navel orangeworm damage on maybe five percent of the nuts near the north fence.",
    ],
    tags: ["Needs follow-up"],
  },
  {
    key: "today-grace",
    worker: "Grace Kim",
    activity: "FERTILIZING",
    field: "Field C",
    daysAgo: 0,
    start: "06:15",
    end: "08:45",
    product: "UAN 32",
    quantity: 180,
    unit: "lb/acre",
    responseAccuracy: 90,
    status: "REVIEWED",
    answers: [
      "Fertilizing.",
      "Field C.",
      "U A N thirty two, one hundred eighty pounds per acre through the drip.",
      "Six fifteen to eight forty five.",
      "Nothing else.",
    ],
    tags: ["Chemical application"],
  },
  {
    key: "today-noah",
    worker: "Noah Williams",
    activity: "EQUIPMENT_MAINTENANCE",
    field: null,
    daysAgo: 0,
    start: "07:00",
    end: "10:30",
    responseAccuracy: 87,
    status: "REVIEWED",
    answers: [
      "Equipment maintenance.",
      "The shop, not in a field.",
      "No product. Changed hydraulic fluid on the John Deere and replaced a sprayer nozzle.",
      "Seven to ten thirty.",
      "The sprayer boom on the left side still drips, we should order a seal.",
    ],
    tags: ["Equipment issue"],
  },
];

/** A recording that could not be processed — counts toward "today's recordings" but has no log. */
export const FAILED_RECORDING = {
  key: "today-ava-failed",
  worker: "Ava Nguyen",
  daysAgo: 0,
  time: "09:05",
  answers: ["...", "sorry the signal is", "can you hear me"],
  transcript: "[transcription failed: audio too short / no speech detected]",
};

// ───────────────────────────── Historical reviewed logs ─────────────────────────────
// Populates the Activity Logs page and keeps this month's accuracy at exactly 90.

const HISTORY_TEMPLATES: Omit<SeedLog, "key" | "daysAgo" | "status" | "responseAccuracy">[] = [
  {
    worker: "Ethan Brown",
    activity: "PRUNING",
    field: "Field A",
    start: "06:30",
    end: "11:00",
    answers: ["Pruning.", "Field A, almonds.", "No product.", "Six thirty to eleven.", "Nothing else."],
  },
  {
    worker: "Chloe Martinez",
    activity: "SPRAYING",
    field: "Field B",
    start: "05:45",
    end: "09:20",
    product: "Kaolin clay (Surround WP)",
    quantity: 25,
    unit: "lb/acre",
    answers: [
      "Spraying.",
      "Field B.",
      "Surround, twenty five pounds per acre.",
      "Five forty five to nine twenty.",
      "Wind picked up at the end so we stopped early.",
    ],
    tags: ["Chemical application", "Weather delay"],
  },
  {
    worker: "Lucas Garcia",
    activity: "SOIL_WORK",
    field: "Field F",
    start: "07:00",
    end: "12:30",
    answers: ["Soil work, discing.", "Field F.", "No product.", "Seven to twelve thirty.", "Nothing else."],
  },
  {
    worker: "Emma Davis",
    activity: "IRRIGATION",
    field: "Field E",
    start: "06:00",
    end: "08:00",
    answers: ["Irrigating.", "Field E.", "No product.", "Six to eight.", "All sets ran fine."],
  },
  {
    worker: "Isaac Wang",
    activity: "FERTILIZING",
    field: "Field D",
    start: "06:10",
    end: "09:00",
    product: "Potassium sulfate",
    quantity: 150,
    unit: "lb/acre",
    answers: [
      "Fertilizing.",
      "Field D, alfalfa.",
      "Potassium sulfate, one fifty pounds per acre.",
      "Six ten to nine.",
      "Nothing else.",
    ],
    tags: ["Chemical application"],
  },
  {
    worker: "Maya Patel",
    activity: "SCOUTING",
    field: "Field A",
    start: "13:00",
    end: "14:30",
    answers: ["Scouting.", "Field A.", "No product.", "One to two thirty.", "Mite pressure looks low."],
  },
  {
    worker: "Liam Johnson",
    activity: "HARVESTING",
    field: "Field F",
    start: "05:30",
    end: "12:00",
    answers: ["Harvesting corn silage.", "Field F.", "No product.", "Five thirty to noon.", "Chopper ran hot around ten."],
    tags: ["Equipment issue"],
  },
  {
    worker: "Sophia Lee",
    activity: "PLANTING",
    field: "Field E",
    start: "07:30",
    end: "11:45",
    answers: ["Planting cover crop.", "Field E.", "Cover crop mix, about forty pounds per acre.", "Seven thirty to eleven forty five.", "Nothing else."],
    product: "Cover crop mix",
    quantity: 40,
    unit: "lb/acre",
  },
  {
    worker: "Mateo Alvarez",
    activity: "SPRAYING",
    field: "Field C",
    start: "05:30",
    end: "08:15",
    product: "Bt (Dipel DF)",
    quantity: 1,
    unit: "lb/acre",
    answers: ["Spraying.", "Field C, tomatoes.", "Dipel, one pound per acre.", "Five thirty to eight fifteen.", "Nothing else."],
    tags: ["Chemical application", "Verified on site"],
  },
  {
    worker: "Grace Kim",
    activity: "IRRIGATION",
    field: "Field B",
    start: "06:00",
    end: "09:00",
    answers: ["Irrigating.", "Field B.", "No product.", "Six to nine.", "Nothing else."],
  },
  {
    worker: "Noah Williams",
    activity: "EQUIPMENT_MAINTENANCE",
    field: null,
    start: "08:00",
    end: "11:00",
    answers: ["Equipment maintenance.", "Shop.", "No product.", "Eight to eleven.", "Serviced the ATV."],
  },
  {
    worker: "Ava Nguyen",
    activity: "PRUNING",
    field: "Field B",
    start: "06:30",
    end: "10:30",
    answers: ["Pruning.", "Field B, walnuts.", "No product.", "Six thirty to ten thirty.", "Nothing else."],
  },
];

/**
 * 24 historical logs spread over the last ~70 days (never today, never on the
 * four NEW-log days). Accuracy values are chosen so that everything in the
 * current month averages exactly 90 together with the NEW and TODAY logs.
 */
export const HISTORY_LOGS: SeedLog[] = Array.from({ length: 24 }, (_, i) => {
  const t = HISTORY_TEMPLATES[i % HISTORY_TEMPLATES.length];
  const daysAgo = 4 + i * 3 + (i % 2); // 4, 8, 10, 14, 16, ... ≈ 70 days back
  const accuracy = [95, 85, 92, 88, 90, 90, 97, 83, 89, 91, 94, 86][i % 12];
  return {
    ...t,
    key: `hist-${i + 1}`,
    daysAgo,
    responseAccuracy: accuracy,
    status: i === 5 ? "FLAGGED" : "REVIEWED",
  };
});

export const ALL_LOGS: SeedLog[] = [...NEW_LOGS, ...TODAY_LOGS, ...HISTORY_LOGS];
