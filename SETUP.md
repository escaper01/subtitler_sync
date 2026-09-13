# Setting this up, from nothing to live

Four folders ship together: `extension/` (the full build), `extension-lite/` (the Chrome Web
Store listing), `extension-isolated/` (the full build with no server behind it) and `web/`
(the API, the public site and the admin dashboard). This is the order to do things in.

**If all you want is the isolated build, skip Part A's `web/` steps entirely** — it needs
neither Docker nor the API. `cd extension-isolated && npm install && npm run build`, load
`dist/` unpacked, done.

Each folder has its own `CLAUDE.md` with the reasoning behind how it works. This file is only
the sequence.

---

## Part A — Running it on your own machine

Needs Docker and Node 20+.

```bash
cd web
npm install                  # also runs `prisma generate`
cp .env.example .env         # then fill in the Google values below
npm run setup                # starts Postgres in Docker, runs the migrations
npm run db:seed              # puts you in the Admin table
npm run app:up               # builds and starts the app container
```

That last command is the one that changed. **The API now runs in a container of its own, on
http://localhost:47821**, alongside the database and with `restart: unless-stopped` on both
— so it comes back after a reboot and the extension has something to call without anyone
remembering to start a dev server. Both extension builds point at that port by default.

Port 47821 rather than 3000 on purpose: 3000 is the first port every other project on a
machine takes, and a clash there does not fail loudly. The extension connects, gets somebody
else's server, and reports whatever that one says.

You still want `npm run dev` while actually editing the web app — it is on port 3000 with hot
reload, and the two can run at the same time. Point the extension at it for the session with:

```js
chrome.storage.sync.set({ apiBase: 'http://localhost:3000' })
```

run from the service worker console. Clear it with `chrome.storage.sync.remove('apiBase')`.

```bash
cd ../extension
npm install
npm run build
```

```bash
cd ../extension-lite
npm install
npm run build
```

```bash
cd ../extension-isolated
npm install
npm run build
```

Then load them: `chrome://extensions` → enable Developer mode → **Load unpacked** →
select `extension/dist`, and again for `extension-lite/dist` and `extension-isolated/dist`.
All three have distinct ids and can be installed at once. Only the first two need the
container running for anything; the isolated build's Find tab works on its own.

Both can be installed at once — they carry different signing keys and therefore different
ids. That is deliberate; developing them together requires it.

### The one thing you must fetch by hand

`GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`. Everything else in `.env` already works.

1. [console.cloud.google.com](https://console.cloud.google.com) → APIs & Services →
   Credentials → **Create credentials** → OAuth client ID → **Web application**.
2. Authorised redirect URI, exactly:
   `http://localhost:47821/api/auth/callback/google`
3. Paste both values into `web/.env`.

These gate `/admin` and nothing else. Until they are set you cannot sign in to the dashboard;
the site and the search API run regardless. **Customers never sign in to anything** — there
are no customer accounts.

### Who is an admin

Not an env var. It is the `Admin` table, seeded from `web/prisma/seed.mjs`. To add somebody,
put them in that file and run `npm run db:seed`.

**An empty `Admin` table locks everyone out, including you.** That is why seeding is part of
setup rather than optional.

### Checking it works

```bash
cd web && npm run check                # typecheck + tests
LIVE=1 npm test                        # also the ones that hit subtitlecat for real

cd ../extension && npm run check           # typecheck + tests + build + verify + drift check
cd ../extension-lite && npm run check      # the same
cd ../extension-isolated && npm run check  # typecheck + tests + build + verify — no drift check, it is a fork
LIVE=1 npm test                            # in extension-isolated: parse the real subtitlecat
```

`LIVE=1` is the one to run when someone reports that search finds nothing — it tells you
within seconds whether subtitlecat changed their markup.

### Working across the two extensions

Most of `extension-lite/` is a byte-for-byte copy of `extension/`.

```bash
node tools/sync-shared.mjs           # copy extension/ -> extension-lite/
node tools/sync-shared.mjs --check   # fail on drift (runs inside npm run check in both)
```

**Fix it in `extension/`, run the sync, commit both.** Never edit a shared file in
`extension-lite/` — the next sync overwrites it silently.

---

## Part B — Before you deploy anything

### 1. Back up both signing keys

`extension/key.pem`, `extension-lite/key.pem` and `extension-isolated/key.pem` exist and are
git-ignored. Two rules for each:

- **Back it up somewhere outside this repo.** Lose it and that extension can never be
  updated again.
- **Upload the same key to the Chrome Web Store** when you publish. If the Store generates
  its own instead, the published extension gets a different id from the one you have been
  testing.

To print an id and its manifest key again:

```bash
cd extension-lite && npm run key
```

Current ids:

| Build | Id |
|---|---|
| `extension-lite/` — the listing | `amfmeepehkpjlcadlkkcbdclfbofebao` |
| `extension/` — the full build | `gpifnmbipbmkkmpnbcmdlehjbpoheidj` |
| `extension-isolated/` — no server | `dphmlhdlikpnnegfejcebfieoegbjlop` |

### 2. Have a privacy policy

There is one at `/privacy`, written from what the code actually stores. **Read it and make
sure it is still true**, then give its public URL to the Web Store listing, which asks for
one.

Note what it has to say about the lite build: it is not offline. It makes exactly one
request, `GET /api/donate`, and the policy must not claim otherwise.

If you change what is collected, change that page in the same commit.

---

## Part C — Going live

Four steps, and unlike the old paywall rollout they are not order-sensitive in a way that can
break existing installs. Do them in this order anyway — steps 2 and 3 need step 1 to have
happened.

### Step 1 — Deploy `web/`

Deploy the `web/` folder (Vercel is the assumed target). Set these environment variables in
the host's dashboard — `.env.example` explains each one:

| | |
|---|---|
| `DATABASE_URL` | Production Postgres. Neon's free tier is enough. |
| `NEXTAUTH_SECRET` | Fresh value, **not** the development one. See below. |
| `NEXTAUTH_URL` | `https://your-domain` |
| `NEXT_PUBLIC_SITE_URL` | `https://your-domain` — used to build the links the extension opens |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | From the OAuth client. These gate `/admin` and nothing else. |
| `IP_HASH_SALT` | Generate one. See below. |
| `NEXT_PUBLIC_STORE_URL` | The Web Store listing, once step 3 is done |

Two of those you generate rather than fetch from anywhere — `NEXTAUTH_SECRET` and
`IP_HASH_SALT`:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Run it **once per variable**, and use fresh values here rather than the ones from your
development `.env`. `NEXTAUTH_SECRET` signs the admin session cookie; `IP_HASH_SALT` salts
the address hash the rate limiter counts against. Reusing one value means rotating the
harmless one also signs you out.

Then run the migrations against the production database once:

```bash
cd web && DATABASE_URL="<production url>" npx prisma migrate deploy
```

`migrate deploy`, not `migrate dev` — the latter can reset data.

Seed your admin row against production the same way, or insert it by hand:

```bash
DATABASE_URL="<production url>" npm run db:seed
```

### Step 2 — Update the two places that name your domain

1. **Google OAuth** — add `https://your-domain/api/auth/callback/google` to the authorised
   redirect URIs. Keep the localhost one so development still works.
2. **Where the extensions point** — change `DEFAULT_API_BASE` in `src/lib/api.ts`, **in both
   folders**, or leave the default and set it at runtime:
   ```js
   chrome.storage.sync.set({ apiBase: 'https://your-domain' })
   ```
   Changing the default is what you want for a published build. `api.ts` is one of the files
   that legitimately differs between the two, so the sync script will not do this for you.

Then rebuild both:

```bash
cd extension && npm run check
cd ../extension-lite && npm run check
```

### Step 3 — Publish `extension-lite/` to the Web Store

Zip `extension-lite/dist` and upload it, signed with `extension-lite/key.pem`.

The listing will ask for the privacy policy URL (`https://your-domain/privacy`) and for a
justification of the broad host permission. The honest one:

> The video plays inside a cross-origin embed frame whose domain changes, so the extension
> must be injectable anywhere, and it narrows itself at runtime to a list the user controls.
> Nothing runs on a site the user has not added.

**If it is still rejected over that permission**, the next lever is already implied by the
architecture: move `<all_urls>` from `host_permissions` to `optional_host_permissions`, ship
with no host access at all, and have the popup request it **per origin** at the moment the
user allows a site, via `chrome.permissions.request()`. The runtime allowlist stays as it is
and becomes the mirror of what has been granted. That is a real piece of work and is only
worth doing if the simple listing fails.

Review takes days, and auto-update rolls out gradually after that.

### Step 4 — Publish the full build on your own site

`/download` serves it. The zip is a build artefact, not a committed file:

```bash
cd extension && npm run build
cd dist && zip -r ../../web/public/downloads/subtitler-full-<version>.zip .
```

Put the version in the filename so a stale browser cache cannot hand somebody last month's
build, and update the link on the download page to match.

That build **does not auto-update**. The page says so, and it should keep saying so.

---

## Part D — Donations

There is no payment provider, no checkout and nothing to configure in the environment. The
donate buttons are links to services that already know how to accept money.

1. Sign up wherever you want to be paid — PayPal, Ko-fi, Buy Me a Coffee, Patreon, whatever.
2. `/admin/donations` → **Add a link** → pick where, write the button text, paste the URL.
3. `/admin/settings` → switch the donation prompt on and write the sentence above the
   buttons.

Both take effect immediately; the public pages render per request and the extension polls
`/api/donate`. A link added while the prompt is switched off shows nowhere, which is the
useful order to do it in — add the links first, turn it on when they are right.

URLs are validated as `http`/`https` on the way in and again on the way out. That is not
routine hygiene: those links are rendered by the extension inside pages we do not control.

### Watching for abuse

Nothing authenticates the search API. `/admin` leads with the numbers that matter:
**searches**, **refused by the limiter** and **installs searching**, over the last 24 hours.

A non-zero refusal count is either somebody hammering the API or a limit set too tight.
Tighten or loosen at `/admin/settings` → **Search limits**; changes take effect within a
minute rather than at the next deploy, which is the entire reason those numbers are rows in
a table.
