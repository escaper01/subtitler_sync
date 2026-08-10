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

Subtitle **search** needs an account and a subscription; loading your own `.srt` or `.vtt`
stays free forever and touches none of that code. The extension signs in by opening
`{site}/connect`, which hands back an opaque token stored in `chrome.storage.local` and sent
as `X-Subtitler-Key` on every request. The server decides — on `search`, `release` **and**
`download` — and the extension's UI only renders whatever answer came back. Nothing shipped
inside the extension is trusted, because anything shipped inside it can be edited.

**It is switched off until you turn it on.** `ENFORCE_ENTITLEMENT` defaults to false so an
extension build that sends the header can reach users before the server starts requiring it.
Enforcing first breaks search for everyone already installed, with no way to fix it from the
server.

## Status

Working: the overlay, the sync tool, the site allowlist, subtitle search with one-click loading,
the public site, user accounts with a 7-day trial, the subscription gate, Patreon and redeemable
codes, the admin dashboard (overview, reports, requests, users, codes, settings, API reference),
and an admin-editable donation prompt on both surfaces.

Setting up `web/` from scratch is `npm install && cp .env.example .env && npm run setup &&
npm run db:seed` — Postgres runs in Docker (`web/docker-compose.yml`) and the admin list is a
table, seeded from `web/prisma/seed.mjs`. The only values you must fetch by hand are the Google
OAuth client id and secret, and they gate nothing but `/admin`. See `web/CLAUDE.md`.

Going live is four ordered steps — deploy, repoint, publish, *then* enforce — set out in
[`SETUP.md`](./SETUP.md) Part C. The order is the whole point.

The privacy policy lives at `/privacy` and is written from what the code actually stores.
**If you change what is collected, change that page in the same commit** — the Web Store
listing points at it. Telemetry beyond `SearchLog` is not built.
