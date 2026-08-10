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
- **Three values you generate, not fetch** — `NEXTAUTH_SECRET`, `TRIAL_HASH_SALT` and
  `IP_HASH_SALT`. All three are just long random strings:
  ```bash
  node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
  ```
  Run it once **per variable**. They are unrelated secrets with different consequences when
  rotated, so reusing one value means rotating it drags the other two along:
  - `NEXTAUTH_SECRET` signs the session cookie — changing it signs every admin out. At least
    32 characters, and a different value in production than in development.
  - `TRIAL_HASH_SALT` salts "this address has had its trial" — changing it hands **everyone**
    a fresh trial.
  - `IP_HASH_SALT` salts the stored hash of a caller's IP — changing it only resets
    abuse-detection history, so it is the safe one to rotate.
- **`GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`** — the only two you must fetch by hand.
  Google Cloud console → APIs & Services → Credentials → Create credentials → OAuth client
  ID → Web application. The authorised redirect URI must be exactly
  `<NEXTAUTH_URL>/api/auth/callback/google`. Until these are set, `/admin` cannot be signed
  into; everything else runs.
- **`LEMONSQUEEZY_*`** — the shop. The webhook secret is what makes deliveries trustworthy;
  the API key is only used to rescue a licence a webhook lost. Search and `/admin` both work
  without them, so leave them empty until you are actually taking money.
- **`RESEND_API_KEY` / `EMAIL_FROM`** — sends trial keys. Without them the trial form fails
  loudly and rolls the claim back rather than burning somebody's only trial.

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

## The public site

```
app/(site)/                header + footer wrap everything in this group
  page.tsx                 home
  how-to-use/              the guide
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

## Money and the gate

Five files carry the whole model. Read them in this order.

**`lib/entitlement.ts` — the only writer of `User.entitledUntil`.** `Entitlement` rows are an
append-only ledger; that column is a cache of `max(endsAt)` written *only* by `recompute`,
always in the same transaction as the row that changed it. Every paid request reads that one
column, so the hot path is a single indexed lookup returning identity and access together.
If anything else writes it, the ledger and the cache drift and someone loses access they paid
for.

Periods **stack**: a new one starts at `max(now, entitledUntil)`, so buying early never costs
the buyer days — except when the provider states an exact end date, which is copied rather
than added to, because adding thirty days a month drifts a little further every time.
Idempotency rides on the `dedupeKey` unique index — trial-once and webhook replay both fail on
one constraint instead of two hand-written checks.

The trial is recorded in `TrialClaim`, which has **no relation to `User`** on purpose:
entitlements cascade on account deletion, so recording it only on the ledger meant
delete-and-sign-up-again minted a fresh seven days forever. The address is hashed, so an
account can still be erased.

**`lib/license.ts` — the credential.** There is no sign-in. A key identifies its owner and
nothing more; whether that owner may search still comes from `entitledUntil`, so a lapsed
subscription leaves the key intact and simply stops opening the door, and renewing revives
the same key. Hashed with SHA-256 and **not** bcrypt — the key is high-entropy random from
someone else's CSPRNG, so there is nothing to slow an attacker down over, and a slow KDF would
land on every API call.

`activate()` enforces the device limit, and **locks the licence row `FOR UPDATE` before
counting**. This is not defensive habit: a plain transaction around count-then-insert lets two
devices take the same last seat, because under READ COMMITTED neither sees the other's
uncommitted row and the unique index on `(licenseId, installId)` has nothing to fire on when
the install ids differ. It only catches a device racing itself. There is a test for it.

`recoverLicense()` is the missed-webhook path: a key we do not know is checked against Lemon
Squeezy once, and if they vouch for it the rows are created on the spot. Without it a lost
delivery is a paying customer who cannot use what they bought.

**`lib/gate.ts` — the enforcement.** `requireEntitlement` runs on `search`, `release` **and**
`download`. All three: a release path is a shareable string, so gating only search leaves the
other two as a free API for anyone holding one. It returns a ready-made `Response`, so a
route cannot forget the denial. Refusals carry an `ApiErrorCode` and often an `action` button
whose URL is server-owned — it can change without an extension update going through review.

`ENFORCE_ENTITLEMENT` is the rollout switch and defaults to **off**. The build that *sends*
`X-Subtitler-Key` must reach users before the server *requires* it; enforcing first breaks
search for everyone already installed, with no server-side way to undo it.

**`lib/lemonsqueezy.ts` and the webhook — taking money.** Deliveries are signed **HMAC-SHA256
over the raw body**: read `request.text()` once and verify against those bytes, never against
a re-serialised object. The route answers 401 for a bad signature, 400 for an unparseable
body, 200 for events it ignores, and 500 *only* when our database failed — because Lemon
Squeezy retries anything that is not 2xx, and a retry only helps in that last case. A
cancelled subscription is **not** revoked; `ends_at` becomes the end of what was paid for and
access lapses on its own.

**`lib/settings.ts` — the levers.** Rate limits, the trial length and the default device limit
are rows, not constants, cached for 60 seconds so the settings row is not read on every
request. `lib/rateLimit.ts` reads them. A limit that needs a deploy to change is one you
cannot use when you actually need it.

Never add `Access-Control-Allow-Credentials` beside the wildcard origin. The key travels in a
header precisely so a hostile page can never have the browser attach it.

## Admin

`/admin` is the submissions queue; `/admin/api` is the API reference, which used to sit on
the public home page. Navigation is a left rail (`AdminNav`) that collapses to a strip of
links on narrow screens. Both pages are gated in `middleware.ts` — server-side, before the
route is served. A client-side guard would still ship the page bundle to a stranger.

`/admin` has an overview, split queues for reports and requests, users, licences and settings.
Badge counts come from a `groupBy` in the layout — the queue pages cap at 200 rows and
filter by status, so counting fetched rows was wrong in both directions.

**Signing in is admin-only again.** It briefly was not, when customers had accounts; now
they have keys instead, so `signIn` refuses every address not in the `Admin` table and a
stranger cannot hold a session at all. `requireAdmin()` stays on **every** `/api/admin/*`
route regardless — middleware covers `/admin/*` pages only, and cannot reach Prisma from the
edge runtime anyway.

Auth is NextAuth + Google, checked against the **`Admin` table** — which is unrelated to
`User`, the customer record. There are no roles, because there is exactly one kind of admin.
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

Prisma 7 + Postgres. `Submission` holds both bug reports and feature requests — they differ
by a label and are read from one queue. `User`, `Entitlement`, `License`, `LicenseActivation`,
`TrialClaim` and `Plan` carry the money model above; `SiteSetting` is a singleton row of
admin-editable levers.

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
