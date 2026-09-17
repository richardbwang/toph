# Design decisions

This document explains _why_ Toph is built the way it is: what the brief asked
for, the alternatives I weighed, and the trade-offs behind each choice. The
short version: every decision optimises for a real, defensible product rather
than a mock-up — persistent data with a schema that mirrors the page, one
deployable codebase, and no black boxes I can't explain.

## 1. Reading the brief

The Figma notes describe the product precisely enough to derive the data model
from them:

- Farm workers record **audio** hands-free on a phone.
- Toph **transcribes** the audio and **extracts the important information** into
  the platform.
- Farmers review that information on a desktop **dashboard**; a row expands to
  reveal "the whole data behind the log" — the recording, a summary and the
  field on a map.
- The most common use case is logging **what fertilizer/chemical is used on
  what field** — which in California is a regulated record (pesticide-use
  reporting to the county agricultural commissioner). That is why the sidebar
  has a "Compliance" section, and why an audit trail matters.

From the page itself: three aggregate figures (today's recordings, active
workers, response accuracy), a filterable/sortable/searchable list of logs with
employee, activity, date, field and time, and per-row detail with audio,
transcript, tags and a map. "Back-end data should reflect the shape of data on
the page" — so those are the tables.

## 2. Architecture

```
Vercel (Node runtime)                      Neon (Postgres)
┌──────────────────────────────────────┐   ┌────────────────────────┐
│ Next.js 16 App Router                │   │ farms, users, sessions │
│  ├ Server Components  (reads)  ──────┼──▶│ fields, recordings     │
│  ├ Server Actions     (writes) ──────┼──▶│ activity_logs, tags,   │
│  ├ Route Handlers     (ingest, audio,│   │ log_tags, audit_events │
│  │                     CSV)   ───────┼──▶│                        │
│  └ proxy.ts           (cookie check) │   └────────────────────────┘
└──────────────────────────────────────┘
        ▲                      ▲
   desktop browser        phone browser (/record)
   dashboard              MediaRecorder + Web Speech → POST /api/recordings
                                                     → Claude extraction (optional)
```

One codebase, one deploy, one database. The browser never talks to Postgres;
every read and write goes through server code that knows who is signed in and
which farm they belong to.

## 3. Framework: Next.js 16 (App Router), React 19, TypeScript

**Why.** The brief wants a hosted, full-stack app built quickly by one person.
Next.js gives me the React UI, the server-side data access (Server Components),
the write API (Server Actions and Route Handlers) and the deployment story
(Vercel) in a single project. There is no second service to host, no CORS, no
API client to keep in sync with the server, and the first paint of the
dashboard is real HTML with the rows already in it.

**Alternatives considered.**

| Option | Why not |
| --- | --- |
| React (Vite) + Express/Fastify API | Two processes, two deploys, hand-written fetch layer and CORS. Nothing the brief needs benefits from the split. |
| React + FastAPI (Python) | Python is my strongest language, but the split above plus a second hosting provider (Render/Fly) adds surface area to defend and nothing to the product. |
| SvelteKit / Remix | Both capable; React is the largest ecosystem, `react-leaflet` and Lucide have first-class React packages, and Next.js is what Vercel deploys with zero configuration. |
| Plain static HTML + Firebase | Fastest to hack, but "the back-end data should reflect the shape of data on the page" calls for a relational schema, and the extraction pipeline needs server code. |

**Trade-offs I accept.** Next.js has a large surface area and version 16 changed
conventions (`proxy.ts` instead of `middleware.ts`, async `cookies()` and
`searchParams`). I read the bundled docs for the version I installed rather than
relying on older tutorials. Server Actions are POST endpoints, so each one
re-authenticates instead of trusting the caller.

## 4. Styling: Tailwind CSS 4 with design tokens

The Figma file uses a small, consistent vocabulary — Geist, black text,
`#4d4d4d` secondary text, `#f2f2f2` and `#e6e6e6` rules, 14/16/20px radii,
80px pill chips, 0.88px waveform lines. Those values live once in
`src/app/globals.css` (`@theme`) and components reference names like
`border-line-2` or `text-ink-2`. Tailwind's utility classes let me write the
exact paddings from the Figma inspector (`px-[14px] py-[10px]`) next to the
markup they belong to, which is what made pixel-matching fast.

Fonts are self-hosted: the `geist` package ships the variable font and loads it
through `next/font/local`, so the build never depends on Google Fonts and every
environment renders the same glyphs. Icons are the same Lucide set the design
uses (`user-star`, `audio-lines`, `book-check`, `clipboard-pen`, `funnel`…), so
the glyphs are pixel-identical to the file rather than look-alikes.

One detail worth knowing: the design's 48px stat numbers use Figma's "vertical
trim", which trims the line box to the cap height. CSS has the same property now
(`text-box: trim-both cap alphabetic`, Chrome 133+ / Safari 18.2+); older
browsers ignore it gracefully.

## 5. Database: Postgres

**Why relational.** The page is a set of joins: log → worker, log → field, log →
recording, log ↔ tags, plus aggregates over time windows ("this month",
"today"). That is exactly what SQL is for. Enums (`activity_type`, `log_status`)
keep the filters honest; foreign keys with `on delete cascade`/`set null`
express what happens when a field is retired or a recording is purged.

**Why not SQLite / a document store.** SQLite is great locally but does not
persist on serverless hosting, which the brief requires ("hosting the site …
data that persists beyond the session"). A document database would make the
aggregates and the many-to-many tags awkward for no gain.

**Hosting: Neon**, created from Vercel's Storage tab so the connection string is
injected into the project automatically. Free tier, Postgres-compatible, and the
same `pg` driver works locally and in production.

### Schema highlights (`src/db/schema.ts`)

- **`recordings` vs `activity_logs`.** The raw artefact (audio, transcript,
  waveform, processing status) is separate from the structured record extracted
  from it. Not every recording produces a usable log — a failed transcription is
  kept with `status = FAILED` so nothing a worker said is lost — and this is
  precisely why the dashboard can show "5 recordings today" next to "4 new
  logs". Merging them into one table would force nullable columns everywhere
  and hide the pipeline.
- **`farm_id` on every business row.** A farm is the tenant boundary. Every
  query is scoped by the signed-in user's farm, so a bug cannot leak another
  farm's data. It also makes the future multi-farm product a config change, not
  a migration.
- **`sessions` stores a hash.** The browser holds an opaque random token; the
  database holds SHA-256 of it. A leaked dump cannot be replayed as a login.
- **`audit_events` is append-only.** Reviews, tags, deletions and ingests are
  recorded with actor and time. For a chemical-application record that is the
  feature a real customer is buying.
- **Waveform peaks are stored, not computed.** 120 normalised RMS values per
  recording (`real[]`) are computed once at ingest, so the dashboard draws a
  waveform without ever decoding audio.
- **Timestamps are `timestamptz`.** Everything is an absolute instant; the
  farm's IANA timezone decides what "today" and "6:00 AM" mean. Vercel runs in
  UTC and the dashboard still shows California time.
- **Uploaded audio lives in a `bytea` column.** For a demo with sub-megabyte
  clips this keeps deployment to one service. The seeded clips are static
  files, and the player only ever needs a URL, so moving uploads to object
  storage (Vercel Blob, S3) later is a change to one route handler.

## 6. ORM: Drizzle

Drizzle is TypeScript all the way down: the schema is a `.ts` file, migrations
are plain SQL files you can read in `drizzle/`, queries are typed and read like
SQL (`select … from … innerJoin … where and(…)`), and there is no code
generation step or native engine binary. `drizzle-kit generate` diffs the schema
and writes the migration; `drizzle-kit migrate` applies it, and the build runs it
before `next build` so a fresh deploy creates its own tables.

I started with Prisma — its schema language is very readable — but its CLI
needs to download a native engine binary at install time, which the sandboxed
environment I built in could not reach. Switching cost an hour and turned out to
be the better fit: no engine, migrations I can read and hand-edit, and a query
builder that maps one-to-one onto the SQL I would write anyway.

## 7. Authentication: sessions, written by hand

For a single-tenant dashboard with seeded accounts, ~100 lines of auth I fully
understand beat a framework whose defaults I would have to override:

1. Passwords are bcrypt-hashed (cost 10) and verified in constant time.
2. On login a 256-bit random token is generated; its SHA-256 goes in `sessions`,
   the token itself goes in an **httpOnly, SameSite=Lax** cookie. JavaScript can
   never read it (XSS-safe), cross-site POSTs don't carry it (CSRF-safe for the
   server actions, which Next also protects with an Origin check).
3. Every request re-reads the session row (cached per request with React's
   `cache()`), so "Log Out" and role changes are immediate — no JWT waiting to
   expire.
4. `proxy.ts` does a cheap cookie-presence check to bounce anonymous visitors
   before any page renders; the real validation is `requireUser()` in the
   protected layout and inside every action.
5. Roles: `ADMIN` can review, tag and delete; `WORKER` can record. Unknown
   emails and wrong passwords return the same message.

NextAuth/Auth.js would have added OAuth providers I don't need and a
configuration surface I would have to defend; Clerk would add a third-party
dependency and a dashboard of its own. Both are the right call for a product
with social login — not for this brief.

## 8. Where state lives: the URL

Search, sort, period, status, activity and field filters are query parameters.
The Server Component parses them (`parseFilters`), builds the SQL, and renders
the matching rows. Chips are plain links. Consequences:

- Refresh keeps your view; the back button works; a filtered view is a
  shareable link.
- The server does the filtering, so the client never downloads rows it won't
  show — the same code scales from 4 rows to 40,000 (with pagination, see §12).
- No client state library, no hydration mismatch, no "loading" flicker on the
  first paint.

Expanding a row is the one piece of client state, because the rows already
carry everything the detail view needs (recording, field geometry, tags) —
expanding is instant and needs no request.

## 9. Reads vs writes

- **Reads** are Server Components calling `src/lib/queries.ts` directly. No
  REST layer, no `useEffect` fetching, no API client.
- **Dashboard writes** (add/remove tag, mark reviewed / flag / mark new from
  the expanded row or in bulk from the checkboxes, delete) are **Server
  Actions**: a function call from a client component that runs on the server,
  re-checks the session and role, writes, appends an audit event and calls
  `revalidatePath` so the page re-renders with the new data. `useOptimistic`
  shows a new tag instantly and the server render confirms it.
- **Ingest** is a **Route Handler** (`POST /api/recordings`) rather than an
  action, on purpose: it is the endpoint a native mobile app would call, it
  accepts `multipart/form-data` with an audio blob, and it should have an HTTP
  contract (status codes, JSON errors) independent of any React page.
- **Audio streaming** and **CSV export** are also Route Handlers because they
  return non-HTML responses.
- **Live updates** are polling, not websockets. A manager keeps the dashboard
  open; a log filed from a phone should appear on it without a reload. Every
  page asks `GET /api/pulse` every 5 s while the tab is visible; it returns
  the farm's audit-event count (append-only, so it only goes up — a newest
  timestamp alone is not enough, because seeded demo events can carry a later
  time of day than "now"), and the page calls `router.refresh()` only when
  that number moved. One index-only row per poll, nothing for hidden tabs, no
  connection to keep alive on a serverless host, and `router.refresh()` keeps
  client state — the expanded row, a half-typed tag, a playing clip — intact.
  Websockets or SSE would be the upgrade if the farm had hundreds of managers
  watching at once; for one dashboard per farm, polling is the cheaper and
  more robust answer.

## 10. The voice-log pipeline

The brief's "mobile app" is a browser page (`/record`) that works on a phone,
and the brief says workers record **hands-free**. One tap is unavoidable —
browsers only open the microphone and start speech output inside a user
gesture — and after that the phone runs the guided log by itself:

1. `MediaRecorder` captures one audio stream for the whole session. A screen
   wake-lock keeps the phone awake.
2. Each question is **read aloud** with the browser's speech synthesis. While it
   speaks, transcription *and* the recording are paused, so the app never
   transcribes its own voice and the manager's playback contains only the
   worker (a short guard after speech ends lets the speaker's tail die away).
3. The **Web Speech API** then transcribes the answer live (Chrome, Safari). The
   worker moves on by pausing for ~5 s after answering (an on-screen countdown
   shows the wait, and talking again cancels it), or by saying "next"
   ("done", "skip") — a final transcript segment that is only a command is
   treated as one and not stored. Twelve seconds of nothing moves on with a
   spoken "no answer", so the flow never stalls in a noisy field.
4. After the last answer the log is filed automatically behind a five-second
   countdown; tapping any answer interrupts it for a correction, because
   transcription is not perfect and the manager should not have to fix what the
   worker could see was wrong. The result is read back ("Filed as spraying on
   Field A").
5. Waveform peaks are computed **client-side** with the Web Audio API, because a
   Vercel function has no ffmpeg and should not spend its budget decoding audio.
6. `POST /api/recordings` stores the recording with `status = PROCESSING`, runs
   extraction, inserts the `activity_logs` row as `NEW`, marks the recording
   `PROCESSED` (or `FAILED`), and audits the ingest.

Every automatic step has a manual equivalent on screen (Next, Stop, an
editable transcript, File), and a "Hands-free" switch turns the automation
off. Browsers without speech recognition get the tap-and-type version. Why
pause-to-advance rather than a wake word: the Web Speech API cannot listen for
a keyword without also transcribing everything else, and a pause is what people
do naturally at the end of an answer; "next" exists for long answers with
pauses in them. The silence threshold is a constant (`SILENCE_MS`) and is the
first thing I would tune with real workers.

**Extraction** is `src/lib/extract.ts`. With `ANTHROPIC_API_KEY` set, Claude
reads the five answers and returns JSON: activity (one of the enum values), the
field (matched against the farm's real field names — it cannot invent one),
product/quantity/unit, start and end times, a one-sentence summary and a
0–100 "response accuracy" (how many questions got a usable answer — the number
behind the dashboard's 90). Without a key, a keyword heuristic produces a
reasonable log so the demo never depends on an external service. The transcript
is kept verbatim in the format the design shows under "Summary".

The seeded recordings are real audio: each worker's answers were synthesised
with open-source TTS voices (`scripts/gen-audio.ts`), then run through the same
peak analysis, so "Play Recording" plays the words the transcript shows.

## 11. Fidelity to the Figma

I pulled the file through Figma's MCP server rather than eyeballing
screenshots: node sizes, paddings, colours, font weights and the exported
waveform SVG. The page is laid out exactly as the frame is — a 10px gutter, a
280px sidebar card with a `#a6a6a6` border and 16px radius, a main column with
30px side padding, 10px between cards — and the table rows are flex rows with
the same 20px cell padding and 92px action column, so the expanded panel can
sit between rows at full width. The expanded row copies the design's own
transcript text so the two can be compared side by side. Interactive states the
file doesn't specify (hover, a checked checkbox, an open menu, the recorded
tag chips) follow the same tokens.

Things I chose not to copy literally: the map is a real Leaflet map of the
field's polygon on satellite tiles instead of a static image, and the "This
Month" chip shows its count in both views (the file shows it in one).

## 12. What I would do next

- **Pagination / virtualisation** for the logs table (the query already takes a
  limit; the UI would add cursor-based "load more").
- **Object storage for uploads** (Vercel Blob or S3 with signed URLs) once
  clips are not tiny.
- **A real transcription service** (Whisper/Deepgram) server-side, so the
  mobile client only uploads audio and the per-browser speech-recognition
  differences stop mattering; the hands-free flow would keep its shape, with
  silence detected from the audio level instead of the recogniser's events.
- **Row-level security** in Postgres as a second line of defence behind
  `farm_id` scoping.
- **More tests**: `time.ts` has unit tests (`npm test`); I would add the same
  for `filters.ts`, an integration test for the ingest endpoint, and commit the
  Playwright flows I ran by hand during the build (login → dashboard → expand →
  tag, and the hands-free recorder driven with fake speech APIs).
- **Rate limiting** on login and ingest, and password reset / invitations
  instead of seeded passwords.
- **Editable logs**: a manager should be able to correct a field or product the
  extraction got wrong; the audit table is already shaped for it.

## 13. Tools

I used AI coding tools (Claude) throughout — for scaffolding, for reading the
Next.js 16 docs bundled with the package, and for iterating on the UI against
Figma screenshots — and Figma's MCP server to extract the design. Every decision
above is one I can explain and would make again; the sections marked as
trade-offs are where I would push back if asked to change them.
