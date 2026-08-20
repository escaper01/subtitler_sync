# Subtitler

Three independent projects that ship together.

```
extension/        Chrome/Edge MV3 extension — the full build: overlay, sync, dual
                  subtitles, subtitle search and the TVmaze series browser
extension-lite/   the same, minus search — this is the Chrome Web Store listing
web/              Next.js app — the subtitle search API, the public site, the admin dashboard
```

**Setting it up, or deploying it: see [`SETUP.md`](./SETUP.md).**

Each has its own `package.json` and its own install. **There is no workspace tooling** —
`npm install` in each folder, separately. Read `extension/CLAUDE.md` before touching either
extension; it documents constraints that are not guessable from the code.

---

## Why there are two extensions

Subtitle search is what draws Web Store review attention, so the published listing does not
have it. `extension-lite/` is that build: load a subtitle file you already have, fix its
timing, show two languages at once. `extension/` keeps search and the series browser and is
downloaded from the website, loaded unpacked.

They are **separate folders with a large byte-identical overlap**, kept in step by
`tools/sync-shared.mjs`:

```bash
node tools/sync-shared.mjs           # copy extension/ -> extension-lite/
node tools/sync-shared.mjs --check   # fail on drift — runs inside npm run check in BOTH
```

**Fix it in `extension/`, run the sync, commit both.** Never edit a shared file in
`extension-lite/`; the next sync overwrites it silently. The files that are supposed to
differ are listed in that script, so a difference is a decision rather than an oversight.

The two builds carry **different signing keys** and therefore different ids, which is what
lets both be installed at once.

## How the extension and the web app fit together

The extension can load a subtitle file the user picked, which needs nothing from the server.
The full build can also *search* for one, which goes through `web`:

```
panel  →  service worker  →  web/api/*  →  subtitlecat.com
```

Three things about that chain are deliberate:

- **The extension never calls subtitlecat directly.** The parsing lives server-side, so when
  the site changes its markup the fix is a deploy rather than an extension update every user
  has to install.
- **The panel never calls the API directly either.** An MV3 content script's `fetch` obeys
  the *page's* CORS rules; the service worker's obeys the extension's host permissions. So
  requests are relayed through the worker.
- **Subtitle files are relayed, not redirected.** The upstream URL never reaches the client.

**TVmaze is the exception, deliberately.** The series browser calls `api.tvmaze.com` straight
from the service worker rather than through `web/`. No API key, stable contract, and a
browser whose only job is to fill in a text box should not stop working when our server does.
It still runs in the worker, for the CORS reason above.

**`extension-lite/` makes exactly one request:** `GET /api/donate`. Worth remembering when
writing the Store listing — "no network access" would be false.

## The shared contract

`api-types.ts` exists **three times** — `web/lib/`, `extension/src/lib/`,
`extension-lite/src/lib/` — because the folders are independent. `languages.ts` exists twice
(`web/lib/` and `extension/src/lib/`; the lite build has no languages).

**If you change one, change the others in the same commit.** Nothing enforces it. A drifted
language table means a code the user can tick and never receive results for; a drifted
contract fails at runtime, in the one place where no typechecker is looking.

## There is no money in this codebase

There was: an entitlement ledger, licence keys, device limits, trials, customer accounts and
a paywall on search. **All of it was removed.** The extension carries no credential, there is
nothing to sign in to, and every feature is free.

One consequence matters more than the rest and is easy to miss:

> **Nothing authenticates the search API any more.** `requireEntitlement` ran on `search`,
> `release` *and* `download`. What replaced it is `web/lib/rateLimit.ts`, keyed on the
> extension's anonymous install id and a hashed IP. That limiter is the whole guard. A change
> that weakens it is not a tuning change.

Monetisation is donations: `DonationLink` rows edited at `/admin/donations`, rendered on the
site and inside the extension panel. Links to PayPal, Ko-fi or wherever else — there is no
payment provider, no checkout, and nothing is unlocked by donating. `web/lib/donate.ts`
validates every URL and colour on the way in *and* on the way out, because those values are
rendered inside pages we do not control.

`web/CLAUDE.md` sets out what a replacement paywall would have to plug into, if one is ever
wanted.

## Status

Working: the overlay, the sync tool, **two subtitle tracks at once with independent
timing**, the site allowlist, subtitle search with one-click loading, **the TVmaze series
browser** (pick a show, season and episode; it remembers where you got to), the public site,
the donation page, the admin dashboard (overview, reports, requests, donations, settings, API
reference), and the donation prompt on both surfaces.

Rate limits and the donation prompt's wording are **rows in the database**, edited at
`/admin/settings`. A limit that needs a deploy to change is one you cannot use in an
emergency — which matters more now that it is the only thing in front of the API.

Setting up `web/` from scratch is `npm install && cp .env.example .env && npm run setup &&
npm run db:seed` — Postgres runs in Docker (`web/docker-compose.yml`) and the admin list is a
table, seeded from `web/prisma/seed.mjs`. The only values you must fetch by hand are the
Google OAuth client id and secret, and they gate nothing but `/admin`. See `web/CLAUDE.md`.

The privacy policy lives at `/privacy` and is written from what the code actually stores.
**If you change what is collected, change that page in the same commit** — the Web Store
listing points at it. Telemetry beyond `SearchLog` is not built.
