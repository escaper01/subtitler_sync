# Subtitler

Two independent projects that ship together.

```
extension/   Chrome/Edge MV3 extension — the subtitle overlay and sync tool
web/         Next.js app — the subtitle search API, and (later) the admin dashboard
```

**Setting it up, or deploying it: see [`SETUP.md`](./SETUP.md).** That is the ordered
sequence, from an empty machine to a live extension. The order in its Part C matters — turning
enforcement on too early breaks search for everyone already installed.

Each has its own `package.json`, its own install, and its own `CLAUDE.md` with the detail that
matters when working inside it. **There is no workspace tooling** — `npm install` in each folder,
separately. Read `extension/CLAUDE.md` before touching the extension; it documents constraints
that are not guessable from the code.

---

## How they fit together

The extension can load a subtitle file the user picked, which needs nothing from the server. It
can also *search* for one, which goes through `web`:

```
panel  →  service worker  →  web/api/*  →  subtitlecat.com
```

Three things about that chain are deliberate:

- **The extension never calls subtitlecat directly.** The parsing lives server-side, so when the
  site changes its markup the fix is a deploy rather than an extension update every user has to
  install. It is also where the licence check will go.
- **The panel never calls the API directly either.** An MV3 content script's `fetch` obeys the
  *page's* CORS rules; the service worker's obeys the extension's host permissions. So requests
  are relayed through the worker.
- **Subtitle files are relayed, not redirected.** The upstream URL never reaches the client, so
  there will be no link to copy around the paywall once there is one.

## The shared contract

`api-types.ts` and `languages.ts` exist **twice** — once in `web/lib/`, once in
`extension/src/lib/` — because the two folders are independent. Nothing enforces that they match.

**If you change one, change the other in the same commit.** A drifted language table means a code
the user can tick and never receive results for; a drifted contract fails at runtime, in the one
place where neither typechecker is looking.

## The paywall, in one paragraph

Subtitle **search** needs a subscription; loading your own `.srt` or `.vtt` stays free forever
and touches none of that code. **The licence key is the whole credential to the extension** —
it never signs in. The key is pasted into the popup and travels as `X-Subtitler-Key` on every
request alongside `X-Subtitler-Install`, an anonymous per-install id the device limit counts.
The server decides — on `search`, `release` **and** `download` — and the extension's UI only
renders whatever answer came back. Nothing shipped inside the extension is trusted, because
anything shipped inside it can be edited.

Customers **do** have accounts on the website: Google sign-in, which is where the trial is
granted and where the account page lives. That session never reaches the extension.

**There is no payment provider.** Lemon Squeezy was removed after they declined the product,
and nothing has replaced it — entitlements are granted by hand from `/admin` for now. What
survived is the part worth keeping: the entitlement ledger, the keys, the device limit and the
gate are all provider-agnostic, so a replacement is a webhook route and a checkout URL rather
than a rewrite. `web/CLAUDE.md` sets out what one has to supply.

**It is switched off until you turn it on.** `ENFORCE_ENTITLEMENT` defaults to false so an
extension build that sends the header can reach users before the server starts requiring it.
Enforcing first breaks search for everyone already installed, with no way to fix it from the
server.

## Status

Working: the overlay, the sync tool, the site allowlist, subtitle search with one-click
loading, the public site, the pricing page, customer accounts through Google sign-in with a
7-day trial, licence keys, the device limit, device-signal matching to flag duplicate
accounts, the admin dashboard (overview, reports, requests, users, licences, settings, API
reference), and an admin-editable upgrade prompt on both surfaces.

**Not working: taking money.** There is no payment provider — see the paragraph above.

Prices, plan details, rate limits, the trial length and the default device limit are **rows in
the database**, edited at `/admin/settings`. They were constants; a price in two places drifts,
and a limit that needs a deploy to change is a limit you cannot use in an emergency.

Setting up `web/` from scratch is `npm install && cp .env.example .env && npm run setup &&
npm run db:seed` — Postgres runs in Docker (`web/docker-compose.yml`) and the admin list is a
table, seeded from `web/prisma/seed.mjs`. The only values you must fetch by hand are the Google
OAuth client id and secret, and they gate nothing but `/admin`. See `web/CLAUDE.md`.

Going live is four ordered steps — deploy, repoint, publish, *then* enforce — set out in
[`SETUP.md`](./SETUP.md) Part C. The order is the whole point.

The privacy policy lives at `/privacy` and is written from what the code actually stores.
**If you change what is collected, change that page in the same commit** — the Web Store
listing points at it. Telemetry beyond `SearchLog` is not built.
