import "dotenv/config";
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  // Migrations run against a direct (unpooled) connection when the host offers
  // one — Vercel's Neon integration sets DATABASE_URL_UNPOOLED alongside the
  // pooled DATABASE_URL the app uses at runtime.
  dbCredentials: { url: process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL! },
  strict: true,
  verbose: true,
});
