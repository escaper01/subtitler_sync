# Subtitler — web

Next.js app serving the extension's subtitle search API. The admin dashboard will live here too,
at `/admin`, and is not built yet.

## Setting it up from scratch

Needs Docker and Node 20+. From `web/`:

```bash
npm install                  # also runs `prisma generate`
cp .env.example .env         # then fill in the two Google values, see below
npm run setup                # starts Postgres in Docker and runs the migrations
npm run db:seed              # puts you in the Admin table
npm run dev                  # http://localhost:3000
```

`npm run setup` is `docker compose up -d --wait && prisma migrate dev --name init`. The
`--wait` matters: Compose reports the container started as soon as the process spawns, but
Postgres accepts connections a moment later, and a migration run into that gap fails about
half the time.

### The environment file

`.env` is git-ignored; `.env.example` is the committed template and explains every value.
Next reads `.env.local` first and `.env` second, so use `.env.local` for per-machine
overrides.

- **`DATABASE_URL`** — already correct for the Docker database. Host port is **5433**, not
  5432, because 5432 is commonly already occupied; a clash there surfaces as an auth
  failure against somebody else's database rather than as "port in use".
- **`NEXTAUTH_SECRET`** — at least 32 characters. Generate one with:
  ```bash
  node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
  ```
  Changing it signs everyone out. Use a different value in production.
- **`GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`** — the only two you must fetch by hand.
  Google Cloud console → APIs & Services → Credentials → Create credentials → OAuth client
  ID → Web application. The authorised redirect URI must be exactly
  `<NEXTAUTH_URL>/api/auth/callback/google`. Until these are set, `/admin` cannot be signed
  into; everything else runs.
- **`NEXT_PUBLIC_DONATE_URL`** — optional; the Donate button is inert without it.

There is no `ADMIN_EMAILS`. Admins are rows in the database — see below.

## Commands

```bash
npm run dev        # http://localhost:3000 — what the extension points at by default
npm run build
npm run test       # parser tests, offline
npm run check      # typecheck + tests
LIVE=1 npm test    # also hits the real subtitlecat (see below)

npm run db:up      # start Postgres
npm run db:down    # stop it (data kept)
npm run db:reset   # destroy the data, recreate, migrate, re-seed
npm run db:migrate # after editing schema.prisma
npm run db:seed    # re-apply the admin list
npm run db:studio  # browse the data
```

## Stack

Next.js 15 App Router, React 19, Tailwind v4, TypeScript strict, `cheerio` for parsing. Mirrors
the StudyPartner admin dashboard so the two are navigable as one codebase — including its
conventions: NextAuth v4 with Google and an email allowlist, `middleware.ts` gating `/admin/*`
server-side (a client-only guard still ships the page bundle to strangers), SWR for data, and
hand-rolled UI primitives and Tailwind bar charts rather than component and chart libraries.

Next is pinned **above** StudyPartner's `15.4.4`, which carries a long list of advisories
including middleware/proxy bypasses — directly relevant to gating `/admin`. Worth fixing there
too. Two transitive advisories remain (`postcss`, `sharp`, both inside Next); clearing them needs
Next 16, and neither surface is used here.

## The API

```
GET  /api/search?q=<title>&lang=en&page=1   one page of releases, each already expanded
GET  /api/release?path=<release>&lang=en    one release, one language
GET  /api/download?path=<srt>               the subtitle text itself
POST /api/feedback                          bug reports and feature requests (public)
```

**Exactly one language, and it must be one we offer.** An unknown code is a 400, not an
empty result: silently filtering everything away is indistinguishable from "this film has
no subtitles", which is a far worse thing to debug than an error. `q` is 2–100 characters
with whitespace collapsed, so `"  the   matrix "` and `"the matrix"` are one cache entry.

A page is `PAGE_SIZE` (5) releases and **every release on it is expanded**, so a page is
also the unit of upstream work: one search fetch plus five detail fetches, regardless of
how many releases matched. That bound is the reason paging exists — 31 results used to
mean 31 potential detail fetches.

CORS is `*` on purpose: the caller is an opaque `chrome-extension://` origin that cannot be
allowlisted usefully. There are no cookies — the licence key will travel in a header — so
credentials stay off and `*` remains safe.

## Admin

`/admin` is the submissions queue; `/admin/api` is the API reference, which used to sit on
the public home page. Both are gated in `middleware.ts` — server-side, before the route is
served. A client-side guard would still ship the page bundle to a stranger.

Auth is NextAuth + Google, checked against the **`Admin` table**. There is no user table
and no roles, because there is exactly one kind of user. `isAdmin` is re-derived from the
database on **every** token refresh, so deleting a row ends that session's access at its
next request rather than whenever it would have expired.

`isAdminEmail` errs closed: a database failure denies access instead of granting it.

The list is seeded from `prisma/seed.mjs`, which upserts and so is safe to re-run. **An
empty `Admin` table locks everyone out, including you** — to add someone, add them to that
file and `npm run db:seed`, or insert a row by hand.

`/api/admin/*` re-checks the session itself. Middleware only covers `/admin/*` pages; a
mutating route under `/api/*` has to answer for itself rather than trust something upstream
ran.

Env validation happens at *request* time (`assertAuthEnv`), not at import. Validating at
module load meant `next build` needed the production secrets just to collect page data.

## Database

Prisma 7 + Postgres. One table, `Submission`, holding both bug reports and feature requests
— they differ by a label and are read from one queue.

Prisma 7 **removed `url` from the datasource block**: the connection string now lives in
`prisma.config.ts` for the CLI, and reaches the client through a driver adapter
(`@prisma/adapter-pg`) in `lib/db.ts`. Those are two separate paths now; setting only one
gets you a CLI that migrates fine and an app that cannot connect.

Prisma 7 also **stopped loading `.env` by itself**, which is why `prisma/load-env.mjs`
exists and is called from both `prisma.config.ts` and the seed. Without it the CLI sees an
empty connection string and reports it as a broken database rather than as unloaded config.

After editing `schema.prisma`, run `npm run db:migrate` — and note that adding a model
needs `prisma generate` before the client knows about it. `migrate dev` normally does that;
if `db.something` is suddenly `undefined`, that generate did not happen.

Without `DATABASE_URL` the site still builds and the scraping API still works — only
`/admin` and `POST /api/feedback` fail, and both say so rather than showing a stack trace.

## Scraping subtitlecat

`lib/subtitlecat/`. `http.ts` owns every outbound request: one User-Agent, one timeout, one size
cap, and `resolveUpstream`, which is **the SSRF boundary** — paths arrive from clients, so they
are resolved against the base URL and the result must still be on subtitlecat. An absolute URL, a
protocol-relative `//evil.com` and a `..` climb all fail identically. Do not bypass it.

`parse.ts` is the fragile part and is written accordingly: selectors lean on structure
(`table.sub-table tbody tr`, `.sub-single`) rather than the ad wrappers around them, and every
field except the link is optional — a missing download count degrades a row instead of dropping
it.

### Two upstream behaviours that will bite you

- **A dead release answers 200.** It renders a "File Not Found" heading *and* a full grid of
  language rows whose `.srt` files are the site's own 404 page machine-translated into each
  language. Unchecked, those reach the panel as real choices and download as junk. `parseDetail`
  returns `missing: true` for it and `releaseTracks` turns that into a 404. The `-->` check in
  `downloadSubtitle` is the second line of defence.
- **Most languages are machine translations.** The search table's "(translated from X)" is the
  real source language, and a Translate *button* rather than a Download link means the file does
  not exist yet — the site would generate it on request, which is not something we can wait on,
  so those languages are simply omitted.

### When search stops working

Run `LIVE=1 npm test` first. It hits the real site and is the only thing that catches "they
changed their markup", which is the likeliest cause. Fix the selectors, then deploy — no
extension release is involved.

## Caching

`lib/cache.ts`, in-memory with a TTL: searches for 6 hours, release pages for 1. On Vercel that
means per-instance and lost on cold start, which is acceptable while the only cost is an extra
upstream fetch. It moves to Postgres with the licence work, where the hit rate starts to matter.
