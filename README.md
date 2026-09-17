# Toph — farm activity dashboard

Toph lets farm workers log field work by voice and lets the farm manager review
those logs on a desktop dashboard. This repository is the dashboard from the
F26 Dev Challenge Figma, implemented as a full-stack app: a Postgres database
whose tables mirror the shape of the page, session-based login, and a working
voice-log pipeline behind the "Play Recording" button.

**Live demo:** _see the submission email_ · **Login:** `admin@baysranch.com` / `toph-demo`

## What's in the box

| Area | What it does |
| --- | --- |
| **Dashboard** (`/dashboard`) | The Figma frame. Stat cards, the "New Employee Logs" table, Sort / Filter / Search, expandable rows with waveform playback, tags, transcript summary and a satellite map of the field. |
| **Activity Logs** | The same table over every log, every status, newest first, with a status column. |
| **Record** (`/record`) | The worker side. The browser records a guided voice log (five questions), transcribes it live, and files it through the API. |
| **Map, Employees, Audit Manager, Reports, Performance** | Secondary pages driven by the same data: fields on a map, per-worker stats, an append-only audit trail, a monthly report with CSV export. |
| **Auth** | Email + password sign-in, server-side sessions, admin vs. worker roles, "Switch User" and "Log Out" from the sidebar. |

Everything on the page is read from Postgres on each request. Refresh, add a
tag, mark a log reviewed, file a new voice log — it all persists.

## Stack

- **Next.js 16 (App Router) + React 19 + TypeScript** — one codebase renders the
  UI on the server, exposes the write API (Server Actions and Route Handlers) and
  deploys to Vercel with no separate backend.
- **Tailwind CSS 4** — the Figma values (Geist, `#f2f2f2` rules, 14/16/20px
  radii, 0.88px waveform lines…) live as tokens in `src/app/globals.css`.
- **Postgres + Drizzle ORM** — typed schema in `src/db/schema.ts`, plain-SQL
  migrations in `drizzle/`, hosted on Neon in production.
- **Hand-rolled session auth** — bcrypt password hashes, an opaque token in an
  httpOnly cookie, SHA-256 of the token in the `sessions` table.
- **Leaflet** with Esri World Imagery tiles for the field maps.
- **Claude** (optional) turns a transcript into a structured log; a keyword
  heuristic keeps the demo working without an API key.

See [`DESIGN.md`](./DESIGN.md) for why each of these was chosen and what was
considered instead.

## Running it locally

Prerequisites: Node 20+, a Postgres database (local, Neon, or Supabase).

```bash
git clone <this repo> toph && cd toph
npm install
cp .env.example .env          # then set DATABASE_URL
npm run db:migrate            # creates the tables (drizzle/*.sql)
npm run db:seed               # loads the Bays Ranch demo data
npm run dev                   # http://localhost:3000
```

Sign in as `admin@baysranch.com` / `toph-demo` (every seeded account uses the
same demo password; the login page lists them).

### Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | yes | Postgres connection string. Local: `postgresql://user:pass@localhost:5432/toph`. Neon/Supabase strings work as-is (TLS is enabled automatically for non-local hosts). |
| `ANTHROPIC_API_KEY` | no | Enables Claude for turning voice-log answers into a structured log. Without it a keyword heuristic is used. |
| `ANTHROPIC_MODEL` | no | Model id for the step above. Defaults to `claude-sonnet-4-5`. |

### Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Development server. |
| `npm run build` | Applies pending migrations, then builds for production (this is what Vercel runs). |
| `npm run db:generate` | Diff `src/db/schema.ts` against the last migration and write a new SQL migration. |
| `npm run db:migrate` | Apply migrations in `drizzle/`. |
| `npm run db:seed` | Reset and load the demo dataset (idempotent). |
| `npm run db:studio` | Browse the database in Drizzle Studio. |
| `npm run audio:generate` | Re-synthesise the demo voice clips (needs `ffmpeg`, `espeak-ng`, `mbrola`, `festival` — not required to run the app; the clips are committed). |
| `npm run lint` / `npm run typecheck` | ESLint / `tsc --noEmit`. |

## How the pieces fit

```
browser ──GET /dashboard?period=month&sort=date-asc──▶ Server Component
                                                        │ requireUser()  (session cookie → users/farms)
                                                        │ listLogs(farm, filters) ──▶ Postgres
                                                        ▼
                                                   HTML with the rows
        ◀── click "Add Tag" ── Server Action addTag() ──▶ INSERT log_tags + audit_events
                                                        └ revalidatePath → page re-renders

phone ──POST /api/recordings (audio + answers + peaks)─▶ Route Handler
                                                        │ INSERT recordings (status PROCESSING)
                                                        │ extractLog()  (Claude or heuristic)
                                                        │ INSERT activity_logs (status NEW)
                                                        ▼
                                              appears on the dashboard
```

- **State lives in the URL.** Search, sort, period, status, activity and field
  filters are query parameters (`src/lib/filters.ts`, `src/lib/url.ts`). The
  server renders the right rows on the first request; refresh, back button and
  shareable links all work for free.
- **Reads** are in `src/lib/queries.ts` (Drizzle query builder, farm-scoped).
- **Writes** are Server Actions in `src/lib/actions.ts` (tags, review status,
  delete, login/logout) and the ingest Route Handler in
  `src/app/api/recordings/route.ts`. Every write re-checks the session, the
  farm and the role, and appends an `audit_events` row.
- **Time** is stored as absolute instants (`timestamptz`) and always displayed
  in the farm's timezone (`src/lib/time.ts`), so "Today" means today in
  California even though Vercel runs in UTC.

## Data model

```
farms ──┬── users (role: ADMIN | WORKER, status)
        ├── fields (GeoJSON boundary + centre)
        ├── recordings (audio, transcript, waveform peaks, status)
        │      └── activity_logs 0..1  (activity, field, start/end, product, accuracy, status NEW|REVIEWED|FLAGGED)
        │                └── log_tags ── tags
        ├── audit_events (append-only)
        └── sessions (via users)
```

The full schema with comments is in [`src/db/schema.ts`](./src/db/schema.ts);
the SQL Postgres actually runs is in [`drizzle/0000_init.sql`](./drizzle/0000_init.sql).

How the dashboard numbers are defined:

| Figure | Definition |
| --- | --- |
| Todays Recordings · _n New_ | Recordings captured today (farm timezone) · those whose log is still `NEW`. |
| Active Workers | Users with role `WORKER` and status `ACTIVE`. |
| Response Accuracy | Average `response_accuracy` (0–100, how many guided questions got a usable answer) over this month's logs. |
| New Employee Logs (n) | Logs matching the current filters — by default status `NEW`, this month, oldest first. |
| Dashboard badge | `NEW` logs that arrived today. |

## Deploying

1. Push this repository to GitHub.
2. In Vercel: **Add New → Project → Import** the repo (defaults are fine).
3. In the project: **Storage → Create Database → Neon (Postgres)**. Vercel
   injects `DATABASE_URL` into the project automatically.
4. Optionally add `ANTHROPIC_API_KEY` under **Settings → Environment Variables**.
5. **Deploy.** The build runs `drizzle-kit migrate` before `next build`, so the
   tables exist on the first deploy.
6. Load the demo data once: `DATABASE_URL="<the Neon URL>" npm run db:seed`
   from your machine (copy the URL from the Storage tab).

## Project layout

```
src/
  app/                 routes (App Router)
    (app)/             everything behind login — layout.tsx renders the sidebar
    api/               Route Handlers: recording ingest, audio streaming, CSV export
    login/             sign-in page
  components/          UI: sidebar, logs table, filter chips, audio player, map, recorder…
  db/                  schema.ts (tables), index.ts (connection), seed.ts, seed-data.ts
  lib/                 auth, queries, actions, filters, time, extraction, voice-log
  proxy.ts             cheap cookie check that bounces anonymous visitors to /login
drizzle/               SQL migrations
public/audio/          demo voice clips + waveform peaks
scripts/gen-audio.ts   how those clips were made
```
