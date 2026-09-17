import "server-only";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

/**
 * One connection pool per server process.
 *
 * In development Next.js hot-reloads modules, which would otherwise create a
 * new pool on every edit and exhaust Postgres connections, so the pool is
 * cached on `globalThis`. In production (Vercel) each serverless instance
 * gets its own small pool; Neon's connection pooler absorbs the fan-out.
 */
const globalForDb = globalThis as unknown as { pool?: Pool };

function createPool() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set. Copy .env.example to .env and fill it in.");
  }
  // TLS is decided by the connection string: Neon's URL carries
  // `?sslmode=require`, which node-postgres treats as verify-full (certificate
  // checked against the system CAs); a local URL without it connects in plain.
  return new Pool({ connectionString, max: 5 });
}

const pool = globalForDb.pool ?? createPool();
if (process.env.NODE_ENV !== "production") globalForDb.pool = pool;

export const db = drizzle(pool, { schema });
export type Db = typeof db;
export { schema };
