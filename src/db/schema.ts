/**
 * Toph — database schema (Drizzle ORM, PostgreSQL)
 *
 * Design principle: the tables mirror the shape of the data on the dashboard
 * (farm → users → fields → recordings → activity logs → tags) and keep the raw
 * input (a Recording: audio + transcript) separate from the structured output
 * (an ActivityLog: who / what / where / when). Not every recording yields a
 * usable log, which is exactly why the dashboard can show "5 recordings today"
 * next to "4 new employee logs".
 *
 * Every business row carries `farm_id`: a farm is the tenant boundary, so a
 * query scoped to the signed-in user's farm can never leak another farm's data.
 */
import { relations } from "drizzle-orm";
import {
  customType,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/** Postgres `bytea` — Drizzle has no built-in binary column yet. */
const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => "bytea",
});

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });
const createdAt = () => ts("created_at").defaultNow().notNull();

// ───────────────────────────── Enums ─────────────────────────────

export const roleEnum = pgEnum("role", ["ADMIN", "WORKER"]);
export const userStatusEnum = pgEnum("user_status", ["ACTIVE", "INACTIVE"]);
export const recordingStatusEnum = pgEnum("recording_status", [
  "PROCESSING", // audio received, transcription/extraction still running
  "PROCESSED", // an activity log was produced
  "FAILED", // could not transcribe / extract (kept for auditability)
]);
export const recordingSourceEnum = pgEnum("recording_source", ["MOBILE_APP", "WEB", "SEED"]);
export const activityTypeEnum = pgEnum("activity_type", [
  "SPRAYING",
  "FERTILIZING",
  "PLANTING",
  "IRRIGATION",
  "HARVESTING",
  "SCOUTING",
  "PRUNING",
  "SOIL_WORK",
  "EQUIPMENT_MAINTENANCE",
]);
export const logStatusEnum = pgEnum("log_status", [
  "NEW", // extracted, waiting for a manager to look at it
  "REVIEWED", // a manager confirmed it
  "FLAGGED", // a manager marked it as needing follow-up
]);

// ───────────────────────────── Tenancy ─────────────────────────────

export const farms = pgTable("farms", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  timezone: text("timezone").notNull().default("America/Los_Angeles"),
  createdAt: createdAt(),
});

// ───────────────────────────── People ─────────────────────────────

/**
 * Everyone on the farm is a user. `role` decides what they can do; workers
 * may never log into the dashboard, so `password_hash` is nullable.
 */
export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    farmId: uuid("farm_id")
      .notNull()
      .references(() => farms.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    email: text("email").notNull(),
    passwordHash: text("password_hash"),
    role: roleEnum("role").notNull().default("WORKER"),
    status: userStatusEnum("status").notNull().default("ACTIVE"),
    avatarUrl: text("avatar_url"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("users_email_idx").on(t.email), index("users_farm_status_idx").on(t.farmId, t.status)],
);

/**
 * Server-side sessions. The browser only holds an opaque random token in an
 * httpOnly cookie; we store the SHA-256 of that token, so a leaked database
 * dump cannot be replayed as a login.
 */
export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tokenHash: text("token_hash").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: ts("expires_at").notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("sessions_token_hash_idx").on(t.tokenHash), index("sessions_user_idx").on(t.userId)],
);

// ───────────────────────────── Land ─────────────────────────────

/**
 * A field/block on the farm. `boundary` is a GeoJSON polygon so the map can
 * draw the exact plot; the centre is denormalised for cheap pins and stats.
 */
export const fields = pgTable(
  "fields",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    farmId: uuid("farm_id")
      .notNull()
      .references(() => farms.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    crop: text("crop"),
    acres: real("acres"),
    centerLat: doublePrecision("center_lat").notNull(),
    centerLng: doublePrecision("center_lng").notNull(),
    boundary: jsonb("boundary").$type<GeoJSON.Polygon>().notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("fields_farm_name_idx").on(t.farmId, t.name)],
);

// ───────────────────────────── Voice logs ─────────────────────────────

/**
 * The raw artefact a worker produced: audio + transcript + waveform peaks.
 * Seeded clips ship as static files (`audio_url`); clips uploaded from the
 * record page are stored inline (`audio_data`) and served by a route handler.
 * Either way the player only ever needs a URL.
 */
export const recordings = pgTable(
  "recordings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    farmId: uuid("farm_id")
      .notNull()
      .references(() => farms.id, { onDelete: "cascade" }),
    workerId: uuid("worker_id")
      .notNull()
      .references(() => users.id),
    capturedAt: ts("captured_at").notNull(),
    durationSec: real("duration_sec").notNull(),
    mimeType: text("mime_type").notNull().default("audio/mpeg"),
    audioUrl: text("audio_url"),
    audioData: bytea("audio_data"),
    /** 0..1 normalised amplitude peaks (~120 samples), precomputed once so the
     *  dashboard never decodes audio just to draw a waveform. */
    waveform: real("waveform").array().notNull(),
    transcript: text("transcript").notNull(),
    status: recordingStatusEnum("status").notNull().default("PROCESSED"),
    source: recordingSourceEnum("source").notNull().default("MOBILE_APP"),
    createdAt: createdAt(),
  },
  (t) => [index("recordings_farm_captured_idx").on(t.farmId, t.capturedAt)],
);

/** The structured record extracted from a recording — one row in the table. */
export const activityLogs = pgTable(
  "activity_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    farmId: uuid("farm_id")
      .notNull()
      .references(() => farms.id, { onDelete: "cascade" }),
    recordingId: uuid("recording_id").references(() => recordings.id, { onDelete: "set null" }),
    workerId: uuid("worker_id")
      .notNull()
      .references(() => users.id),
    fieldId: uuid("field_id").references(() => fields.id, { onDelete: "set null" }),
    activity: activityTypeEnum("activity").notNull(),
    startedAt: ts("started_at").notNull(),
    endedAt: ts("ended_at").notNull(),
    /** Chemical / fertiliser / seed product, when the activity involves one. */
    product: text("product"),
    quantity: real("quantity"),
    unit: text("unit"),
    /** What the dashboard shows under "Summary". */
    summary: text("summary").notNull(),
    /** 0–100: how many of the guided questions got a usable answer. */
    responseAccuracy: integer("response_accuracy").notNull(),
    status: logStatusEnum("status").notNull().default("NEW"),
    reviewedAt: ts("reviewed_at"),
    reviewedById: uuid("reviewed_by_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: ts("updated_at")
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    uniqueIndex("activity_logs_recording_idx").on(t.recordingId),
    index("activity_logs_farm_status_started_idx").on(t.farmId, t.status, t.startedAt),
    index("activity_logs_farm_worker_idx").on(t.farmId, t.workerId),
  ],
);

// ───────────────────────────── Tags ─────────────────────────────

export const tags = pgTable(
  "tags",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    farmId: uuid("farm_id")
      .notNull()
      .references(() => farms.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("tags_farm_name_idx").on(t.farmId, t.name)],
);

/** Explicit join table so we can record who tagged what, and when. */
export const logTags = pgTable(
  "log_tags",
  {
    logId: uuid("log_id")
      .notNull()
      .references(() => activityLogs.id, { onDelete: "cascade" }),
    tagId: uuid("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
    createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.logId, t.tagId] })],
);

// ───────────────────────────── Compliance ─────────────────────────────

/**
 * Append-only trail of who changed what. Chemical-application records are
 * regulated (e.g. California pesticide-use reporting), so reviews, tags and
 * edits must be reconstructible after the fact.
 */
export const auditEvents = pgTable(
  "audit_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    farmId: uuid("farm_id")
      .notNull()
      .references(() => farms.id, { onDelete: "cascade" }),
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    meta: jsonb("meta").$type<Record<string, unknown>>(),
    createdAt: createdAt(),
  },
  (t) => [index("audit_events_farm_created_idx").on(t.farmId, t.createdAt)],
);

// ───────────────────────────── Relations ─────────────────────────────
// (used by the relational query API: db.query.activityLogs.findMany({ with: … }))

export const farmsRelations = relations(farms, ({ many }) => ({
  users: many(users),
  fields: many(fields),
  recordings: many(recordings),
  logs: many(activityLogs),
  tags: many(tags),
}));

export const usersRelations = relations(users, ({ one, many }) => ({
  farm: one(farms, { fields: [users.farmId], references: [farms.id] }),
  sessions: many(sessions),
  recordings: many(recordings),
  logs: many(activityLogs, { relationName: "logWorker" }),
  reviewedLogs: many(activityLogs, { relationName: "logReviewer" }),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
}));

export const fieldsRelations = relations(fields, ({ one, many }) => ({
  farm: one(farms, { fields: [fields.farmId], references: [farms.id] }),
  logs: many(activityLogs),
}));

export const recordingsRelations = relations(recordings, ({ one }) => ({
  farm: one(farms, { fields: [recordings.farmId], references: [farms.id] }),
  worker: one(users, { fields: [recordings.workerId], references: [users.id] }),
  log: one(activityLogs, { fields: [recordings.id], references: [activityLogs.recordingId] }),
}));

export const activityLogsRelations = relations(activityLogs, ({ one, many }) => ({
  farm: one(farms, { fields: [activityLogs.farmId], references: [farms.id] }),
  recording: one(recordings, { fields: [activityLogs.recordingId], references: [recordings.id] }),
  worker: one(users, { fields: [activityLogs.workerId], references: [users.id], relationName: "logWorker" }),
  field: one(fields, { fields: [activityLogs.fieldId], references: [fields.id] }),
  reviewedBy: one(users, {
    fields: [activityLogs.reviewedById],
    references: [users.id],
    relationName: "logReviewer",
  }),
  tags: many(logTags),
}));

export const tagsRelations = relations(tags, ({ one, many }) => ({
  farm: one(farms, { fields: [tags.farmId], references: [farms.id] }),
  logs: many(logTags),
}));

export const logTagsRelations = relations(logTags, ({ one }) => ({
  log: one(activityLogs, { fields: [logTags.logId], references: [activityLogs.id] }),
  tag: one(tags, { fields: [logTags.tagId], references: [tags.id] }),
  createdBy: one(users, { fields: [logTags.createdById], references: [users.id] }),
}));

export const auditEventsRelations = relations(auditEvents, ({ one }) => ({
  farm: one(farms, { fields: [auditEvents.farmId], references: [farms.id] }),
  actor: one(users, { fields: [auditEvents.actorId], references: [users.id] }),
}));

// ───────────────────────────── Types ─────────────────────────────

export type Farm = typeof farms.$inferSelect;
export type User = typeof users.$inferSelect;
export type Field = typeof fields.$inferSelect;
export type Recording = typeof recordings.$inferSelect;
export type ActivityLog = typeof activityLogs.$inferSelect;
export type Tag = typeof tags.$inferSelect;
export type ActivityType = (typeof activityTypeEnum.enumValues)[number];
export type LogStatus = (typeof logStatusEnum.enumValues)[number];
export type Role = (typeof roleEnum.enumValues)[number];
