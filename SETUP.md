# Setting this up

Two folders: `extension-isolated/` (the extension — the whole product, no server) and `web/`
(a Next.js app the extension does **not** use). The reasoning behind how each works is in the
root [`CLAUDE.md`](./CLAUDE.md); this file is only the sequence.

---

## Part A — The extension

Needs Node 20+. Nothing else: no Docker, no database, no API.

```bash
cd extension-isolated
npm install
npm run check          # typecheck + tests + build + verify, for Chrome and Firefox
```

**Chrome / Edge** — `chrome://extensions` → Developer mode → **Load unpacked** → select
`extension-isolated/dist`. After a rebuild hit the reload icon on the card, then reload the page
under test.

**Firefox** — `npm run build:firefox`, then `about:debugging#/runtime/this-firefox` →
**Load Temporary Add-on** → pick `extension-isolated/dist-firefox/manifest.json`. It is removed
when Firefox restarts. For a permanent install see *Publishing* below.

`LIVE=1 npm test` also parses the real subtitlecat with the bundled selectors. It is the first
thing to run when someone reports that search finds nothing — it says within seconds whether the
site changed its markup (and `remote/README.md` says how to fix that without a new build).

Other commands: `npm run dev` (watch + HMR; the offline harness is `/test/local.html`),
`npm run icons`, `npm run package:firefox` (zip for Firefox), `npm run config:publish` (push the
remote selector/donation config).

---

## Part B — Before you publish anything

### Back up the signing key

`extension-isolated/key.pem` is git-ignored. It fixes the Chrome extension's id
(`dphmlhdlikpnnegfejcebfieoegbjlop`).

- **Back it up somewhere outside this repo.** Lose it and the extension can never be updated.
- **Upload the same key to the Chrome Web Store** when you publish; otherwise the published
  extension gets a different id from the one you tested.

`npm run key` prints an id and its manifest key again.

`retired-keys/` holds the keys of the two removed builds (`extension/`, `extension-lite/` — the
latter was the Web Store listing). They are git-ignored, and are only kept in case that listing
is ever updated. Delete the folder when you are sure it never will be.

### Privacy policy

The extension makes requests to `subtitlecat.com`, `api.tvmaze.com` and
`raw.githubusercontent.com`, all from the service worker, and stores your allowlist, style,
language and per-film subtitles locally. A store listing asks for a policy that says so.
The page at `/privacy` in `web/` was written for the removed builds and **does not describe
this one** — write or adapt one before submitting.

---

## Part C — Publishing

**Chrome Web Store** — zip `extension-isolated/dist` and upload it, signed with the key above.
The listing asks for a justification of the broad host permission. The honest one:

> The video plays inside a cross-origin embed frame whose domain changes, so the extension
> must be injectable anywhere, and it narrows itself at runtime to a list the user controls.
> Nothing runs on a site the user has not added.

If that is rejected, the next lever is moving `<all_urls>` to `optional_host_permissions` and
requesting access per origin when the user allows a site.

**Firefox** — release Firefox only installs *signed* add-ons, and shows "could not be installed
because it appears to be corrupt" for an unsigned one. Run `npm run package:firefox`, then
submit `dist-firefox-xpi/*.zip` at addons.mozilla.org → Developer Hub → *On your own* (unlisted)
for free signing, and install the `.xpi` it returns. The gecko id
(`subtitler-isolated@escaper01.github.io`, in `src/manifest.config.ts`) is permanent once signed,
and every upload needs a higher `version` in `package.json`. Nightly and Developer Edition can
instead set `xpinstall.signatures.required` to `false` in `about:config`.

**Remote config** — selectors and the donation prompt come from
`escaper01/subtitler-config` on GitHub, published with `npm run config:publish`. A renamed class
on subtitlecat is an edit to `remote/config.json` plus a publish, not a release.

---

## Part D — `web/` (optional)

Nothing in the extension needs this. It is a subtitle search API, a public site and an admin
dashboard, kept as it was. Needs Docker and Node 20+.

```bash
cd web
npm install                  # also runs `prisma generate`
cp .env.example .env         # then fill in the Google values below
npm run setup                # starts Postgres in Docker, runs the migrations
npm run db:seed              # puts you in the Admin table
npm run app:up               # builds and starts the app on http://localhost:47821
```

The app runs as a container with `restart: unless-stopped`, alongside its database. Port 47821
rather than 3000 on purpose — 3000 is the first port every other project takes, and a clash
there does not fail loudly. `npm run dev` gives hot reload on 3000, and the two can run at once.

**By hand, once:** `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` — Google Cloud console → APIs &
Services → Credentials → OAuth client ID → Web application, with the redirect URI exactly
`http://localhost:47821/api/auth/callback/google`. They gate `/admin` and nothing else.

**Admins** are the `Admin` table, seeded from `web/prisma/seed.mjs` (add yourself, then
`npm run db:seed`). An empty table locks everyone out, including you.

**Checking it works:** `cd web && npm run check`, and `LIVE=1 npm test` for the tests that hit
subtitlecat for real.

**Deploying** (Vercel assumed): set `DATABASE_URL` (production Postgres), `NEXTAUTH_SECRET`,
`NEXTAUTH_URL`, `NEXT_PUBLIC_SITE_URL`, `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`,
`IP_HASH_SALT` and `NEXT_PUBLIC_STORE_URL`. Generate the two secrets once **each**, fresh for
production:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Then `cd web && DATABASE_URL="<production url>" npx prisma migrate deploy` (never `migrate dev`
against production — it can reset data) and seed your admin row the same way. Add
`https://your-domain/api/auth/callback/google` to the OAuth client's redirect URIs.

**Donations** are links, not a payment provider: `/admin/donations` → *Add a link*, then
`/admin/settings` → switch the prompt on. URLs are validated on the way in and out because they
are rendered inside pages we do not control. **Nothing authenticates the search API** — the rate
limiter is the whole guard, and `/admin` leads with the numbers to watch (*Refused by the
limiter* above all).
