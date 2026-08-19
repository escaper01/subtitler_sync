# Subtitler — web

Next.js app serving the extension's subtitle search API, the public site, and the admin
dashboard at `/admin`.

**There is no money in this codebase.** Subscriptions, licence keys, entitlements, trials,
device limits and customer accounts were all removed — the extension is free and carries no
credential. What replaced the gate is a rate limiter, and that is the single most important
thing to understand before changing anything here. See *No money, and what guards the API*
below.

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
- **Two values you generate, not fetch** — `NEXTAUTH_SECRET` and `IP_HASH_SALT`. Both are
  just long random strings:
  ```bash
  node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
  ```
  Run it once **per variable**. They are unrelated secrets with different consequences when
  rotated, so reusing one value means rotating it drags the other along:
  - `NEXTAUTH_SECRET` signs the session cookie — changing it signs every admin out. At least
    32 characters, and a different value in production than in development.
  - `IP_HASH_SALT` salts the stored hash of a caller's IP. It used to be for abuse
    *history*; it is now part of the abuse *guard*, because the IP hash is one of the two
    subjects the rate limiter counts against. Rotating it still only resets history, so it
    remains the safe one to rotate.
- **`GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`** — the only two you must fetch by hand.
  Google Cloud console → APIs & Services → Credentials → Create credentials → OAuth client
  ID → Web application. The authorised redirect URI must be exactly
  `<NEXTAUTH_URL>/api/auth/callback/google`. Until these are set, `/admin` cannot be signed
  into; everything else runs.
- **Nothing about money.** There is no payment provider, no checkout and nothing to
  configure. Donations are links to somewhere else, stored as rows and edited at
  `/admin/donations`.

`TRIAL_HASH_SALT`, `DEVICE_HASH_SALT`, `ENFORCE_ENTITLEMENT`, `RESEND_API_KEY` and
`EMAIL_FROM` were all removed. An existing `.env` carrying them still works — they are
simply ignored.

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
GET  /api/donate                            the donation prompt and its buttons
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
allowlisted usefully. There are no cookies on these routes and no credential of any kind, so
credentials stay off and `*` remains safe. **Never add `Access-Control-Allow-Credentials`
beside the wildcard** — the app's own session-bearing routes use `lib/appApi.ts`, which
emits no CORS headers at all, and that separation is the reason it exists.

`/api/donate` is the only call the search-free build ever makes.

## The public site

```
app/(site)/                header + footer wrap everything in this group
  page.tsx                 home
  donate/                  where /pricing used to be
  how-to-use/              the guide
  privacy/                 written from what the code actually stores
  report/                  bug reports
  feature-request/         feature requests
app/admin/                 outside the group — its own shell, no marketing chrome
```

**The palette encodes sync state.** Amber (`--drift`) is a subtitle that has drifted; sky
(`--accent`) is one that lands on the word. They mean nothing else anywhere on the site, so
don't reach for either as a general-purpose highlight. The hero's caption animates between
the two — that drift-and-snap is the product's whole argument, shown instead of described.

**Theme.** Class-based (`.dark` on `<html>`), with an inline script in the root layout that
applies the stored choice before first paint. It has to be inline and synchronous or the
page flashes light before dark lands. Colours are CSS variables mapped into Tailwind via
`@theme inline`, so `bg-surface` and `text-muted` work in both themes — use the tokens
rather than `neutral-*`, which cannot flip.

**Screenshots are placeholders.** `public/screenshots/*.svg`, generated by
`node tools/make-placeholders.mjs`. Replace a file with a real screenshot and nothing else
changes; the paths live in `lib/features.ts`, which is also the single source for what the
product does — home page, guide and store listing all drifted apart when they were written
separately. Images are 16:10.

**The store URL** is a placeholder in `lib/site.ts` until the listing is published. Set
`NEXT_PUBLIC_STORE_URL` and every "Add to Chrome" button follows.

## No money, and what guards the API

There was a paywall. It is gone, and what it left behind is the most important thing on this
page.

**Deleted:** `lib/entitlement.ts`, `lib/license.ts`, `lib/gate.ts`, `lib/requireUser.ts`,
`lib/customers.ts`, `lib/users.ts`, `lib/deviceSignal.ts`, `lib/email.ts`, the `User`,
`Entitlement`, `License`, `LicenseActivation`, `TrialClaim`, `Plan` and `DeviceSignal`
tables, `/pricing`, `/account`, `/signin`, `/admin/users`, `/admin/licenses`, `/api/trial`,
`/api/me` and `/api/account/device`. The extension sends no credential and there is nothing
to sign in to.

### The consequence, stated plainly

`requireEntitlement` used to run on `search`, `release` **and** `download`. Removing it made
all three **open, unauthenticated endpoints on the public internet** — a working subtitlecat
scraping proxy running on your bill, available to anyone who reads the extension's source.

**`lib/rateLimit.ts` is what replaced it, and it is now the only guard.** Treat it
accordingly: a change that weakens it is not a tuning change, it is the whole defence.

It counts every request against **two** subjects, and the pairing is the point:

- **The install id** (`X-Subtitler-Install`) is generated by the extension and sent in a
  header, so anyone can change it. It is precise — one browser profile — and forgeable.
- **The hashed IP** cannot be chosen by the caller, but one address is routinely a whole
  household or campus, so its bucket is `IP_MULTIPLIER` (5×) looser or a shared connection
  becomes a single user.

Each covers the other's blind spot: rotating the install id still runs into the address
bucket, and a shared address does not punish everyone behind it for one abuser.

Three things about it are load-bearing:

- **A missing install header is not a bypass.** `callerSubjects` maps it to a single shared
  `anonymous` bucket. Treating "no header" as "no limit" would make the limiter opt-in,
  which is the same as not having one. There is a test for this.
- **Search and fetch have separate allowances.** Loading a subtitle is one search *plus* one
  download; counting both against one limit would halve the searches anyone could actually
  complete. `checkFetchLimits` covers `release` and `download` at `FETCH_MULTIPLIER` (3×).
- **It errs open.** A database failure lets the request through. Rate limiting is a guard
  against abuse, not a security boundary, and turning a database blip into an outage for
  everybody is the worse failure.

The limits themselves are rows, read through `lib/settings.ts` and cached for 60 seconds. A
limit that needs a deploy to change is one you cannot use while somebody is abusing the API,
which is the only moment it matters.

### Donations

The only thing resembling money. `DonationLink` rows are links to PayPal, Ko-fi or wherever
else — edited at `/admin/donations`, rendered on the site and **inside the extension panel**.
There is no payment provider and no checkout; nothing is charged and nothing is unlocked.

**`lib/donate.ts` is a validation boundary, not a formatting helper.** Every string it
returns is admin-supplied and ends up rendered by the extension inside pages we do not
control:

- `safeUrl` accepts `http`/`https` only. A `javascript:` href in an admin field would be
  script execution in every page the extension touches; a `data:` one is a phishing page
  served from our own button.
- `safeColor` accepts `^#[0-9a-fA-F]{6}$` and nothing else, because the value reaches an
  inline style attribute in two codebases.
- Everything is rendered as **text**, never as markup. Shadow DOM contains a CSS injection;
  it does not prevent one.

Validation runs on the way in (`/api/admin/donations`) **and** on the way out
(`donatePrompt`). In on the way in stops a bad row existing; out on the way out stops a row
that already does from reaching the extension. A link that fails is dropped, not rendered
dead — a button that goes nowhere is worse than no button.

### If money ever comes back

Do not resurrect the old model from git. What it needed is unchanged and is written down in
`PLAN.md`: an append-only entitlement ledger with one denormalised cache, a credential that
is hashed rather than stored, a device count enforced by a unique index with the licence row
locked `FOR UPDATE` before counting, and a webhook that verifies its signature over the
**raw body**. Those were the parts worth keeping; the code around them was shaped by a
provider that no longer exists.

## Admin

`/admin` is the submissions queue; `/admin/api` is the API reference, which used to sit on
the public home page. Navigation is a left rail (`AdminNav`) that collapses to a strip of
links on narrow screens. Both pages are gated in `middleware.ts` — server-side, before the
route is served. A client-side guard would still ship the page bundle to a stranger.

The rail is: overview, bug reports, requests, donations, settings, API reference. Badge
counts come from a `groupBy` in the layout — the queue pages cap at 200 rows and filter by
status, so counting fetched rows was wrong in both directions.

The overview leads with the only operational question left: is the search API being used
normally, or is somebody hammering it. **`Refused by the limiter`** is the tile to watch — a
non-zero number is either abuse or a limit set too tight, and there is no longer a licence
check behind it to fall back on.

**Signing in is admin-only, and is a security boundary.** It briefly was not, when customers
had accounts and `token.isAdmin` was what told an admin apart. There are no customer
accounts now — no `User` table to put them in — so an address outside the `Admin` table has
nothing it could do here and `signIn` refuses it outright. `requireAdmin()` stays on
**every** `/api/admin/*` route regardless: middleware covers `/admin/*` pages only, and
cannot reach Prisma from the edge runtime anyway.

Auth is NextAuth + Google, checked against the **`Admin` table**, which is now the only kind
of account in the schema. There are no roles, because there is exactly one kind of admin.
`isAdmin` is re-derived from the database on **every** token refresh, so deleting a row ends
that session's access at its next request rather than whenever it would have expired.

`pages.signIn` points at `/admin/login`. It briefly pointed at a neutral `/signin` for
customers; that route went with their accounts, and a failed sign-in landed on a 404.

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

Prisma 7 + Postgres. Six tables, and that is the whole of it:

- `Admin` — who may sign in to the dashboard. The only account type in the system.
- `Submission` — bug reports *and* feature requests; they differ by a label and are read
  from one queue.
- `DonationLink` — the buttons, edited at `/admin/donations`.
- `SiteSetting` — a singleton row of admin-editable levers: the prompt wording and the
  search limits.
- `SearchLog` — what people looked for. Kept through the removal of accounts and re-pointed
  at the install id, because it answers "what are we failing to find" and "is one install
  hammering us", and both still matter.
- `RateLimit` — fixed-window counters. In Postgres rather than the in-memory `TtlCache`
  because that cache is per-instance and lost on cold start, which is useless for anything
  an abuser benefits from resetting.

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
upstream fetch.

Note the deliberate split from `RateLimit`, which is in Postgres. Caching a subtitle page is
worth doing and harmless to lose; a counter an abuser benefits from resetting is not
something to keep in a cache that a cold start clears. Same problem shape, opposite storage,
for that reason.
