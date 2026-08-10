# Setting this up, from nothing to live

Two parts ship together: `extension/` (the Chrome extension) and `web/` (the API, the public
site and the admin dashboard). This is the order to do things in. **Part C is order-sensitive**
— getting it wrong breaks search for everyone who already has the extension installed, and
there is no way to fix that from the server.

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
npm run dev                  # http://localhost:3000
```

```bash
cd ../extension
npm install
npm run build
```

Then load it: `chrome://extensions` → enable Developer mode → **Load unpacked** →
select `extension/dist`.

### The one thing you must fetch by hand

`GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`. Everything else in `.env` already works.

1. [console.cloud.google.com](https://console.cloud.google.com) → APIs & Services →
   Credentials → **Create credentials** → OAuth client ID → **Web application**.
2. Authorised redirect URI, exactly:
   `http://localhost:3000/api/auth/callback/google`
3. Paste both values into `web/.env`.

Until those are set you cannot sign in — everything else runs.

### Who is an admin

Not an env var. It is the `Admin` table, seeded from `web/prisma/seed.mjs`. To add somebody,
put them in that file and run `npm run db:seed`.

**An empty `Admin` table locks everyone out, including you.** That is why seeding is part of
setup rather than optional.

### Checking it works

```bash
cd web && npm run check          # typecheck + tests
DB=1 npm test                    # also the tests that need the database
LIVE=1 npm test                  # also the ones that hit subtitlecat for real

cd ../extension && npm run check # typecheck + tests + build + verify
```

`LIVE=1` is the one to run when someone reports that search finds nothing — it tells you
within seconds whether subtitlecat changed their markup.

---

## Part B — Before you deploy anything

### 1. Pin the extension's identity

Already done, and `extension/key.pem` exists. Two rules:

- **Back it up somewhere outside this repo.** It is git-ignored. Lose it and the published
  extension can never be updated again.
- **Upload this same key to the Chrome Web Store** when you first publish. If the Store
  generates its own instead, the published extension gets a different id from the one the
  website is configured for, and sign-in will work perfectly on your machine and fail
  silently for everyone else.

To print the id and the manifest key again:

```bash
cd extension && npm run key
```

### 2. Have a privacy policy

There is one at `/privacy`, written from what the code actually stores. **Read it and make
sure it is still true**, then give its public URL to the Web Store listing, which asks for one.

If you change what is collected, change that page in the same commit.

---

## Part C — Going live, in this order

> Do not skip to step 4. The extension must be able to *send* its credential before the
> server starts *demanding* one.

### Step 1 — Deploy `web/`

Deploy the `web/` folder (Vercel is the assumed target). Set these environment variables in
the host's dashboard — `.env.example` explains each one:

| | |
|---|---|
| `DATABASE_URL` | Production Postgres. Neon's free tier is enough. |
| `NEXTAUTH_SECRET` | Fresh value, **not** the development one. See below. |
| `NEXTAUTH_URL` | `https://your-domain` |
| `NEXT_PUBLIC_SITE_URL` | `https://your-domain` — used to build links the extension opens |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | From the OAuth client |
| `NEXT_PUBLIC_EXTENSION_ID` | `npm run key` in `extension/` prints it |
| `PATREON_WEBHOOK_SECRET` | From the Patreon webhook, if you use one |
| `IP_HASH_SALT` | Anything long and random |
| `TRIAL_HASH_SALT` | Anything long and random. **Changing it later gives everyone a fresh trial.** |
| `NEXT_PUBLIC_DONATE_URL` | Optional; the Donate button is inert without it |
| `ENFORCE_ENTITLEMENT` | **Leave unset for now.** Step 4 turns it on. |

Generate a production secret:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Then run the migrations against the production database once:

```bash
cd web && DATABASE_URL="<production url>" npx prisma migrate deploy
```

`migrate deploy`, not `migrate dev` — the latter can reset data.

Seed your admin row against production the same way, or insert it by hand:

```bash
DATABASE_URL="<production url>" npm run db:seed
```

### Step 2 — Update the three places that name your domain

1. **Google OAuth** — add `https://your-domain/api/auth/callback/google` to the authorised
   redirect URIs. Keep the localhost one so development still works.
2. **`extension/src/manifest.config.ts`** — add your origin to
   `externally_connectable.matches`:
   ```ts
   matches: ['http://localhost:3000/*', 'https://your-domain/*'],
   ```
   That list is a hard allowlist. A site not on it is **silently ignored**, which looks
   exactly like the extension not being installed.
3. **Where the extension points** — either change `DEFAULT_API_BASE` in
   `extension/src/lib/api.ts`, or leave the default and set it at runtime:
   ```js
   chrome.storage.sync.set({ apiBase: 'https://your-domain' })
   ```
   Changing the default is what you want for a published build.

Then rebuild:

```bash
cd extension && npm run check
```

### Step 3 — Publish the extension, and wait

Zip `extension/dist` and upload it to the Chrome Web Store, signed with `extension/key.pem`.

The listing will ask for the privacy policy URL (`https://your-domain/privacy`) and for a
justification of the broad host permission. The honest one: *the video plays inside a
cross-origin embed frame whose domain changes, so the extension must be injectable anywhere,
and it narrows itself at runtime to a list the user controls.*

**Then wait.** Review takes days, and auto-update rolls out gradually after that. Until most
installs are on the new build, they are sending no credential at all.

### Step 4 — Only now, turn enforcement on

```
ENFORCE_ENTITLEMENT=true
```

Redeploy. Search now requires a subscription; loading your own subtitle file does not, and
never will.

Check it immediately:

```bash
curl -i "https://your-domain/api/search?q=shawshank&lang=en"
# expect 401 with "code":"not_signed_in"
```

If something is wrong, **unset the variable and redeploy** — that is the rollback, and it is
instant.

---

## Part D — Taking money

### Patreon

1. [patreon.com/portal/registration/register-webhooks](https://www.patreon.com/portal/registration/register-webhooks)
2. Point it at `https://your-domain/api/webhooks/patreon`.
3. Subscribe to `members:create`, `members:update`, `members:pledge:create`,
   `members:pledge:update`, `members:pledge:delete`.
4. Copy the secret into `PATREON_WEBHOOK_SECRET`.
5. **Grant the `campaigns.members[email]` scope if you can.** Without it Patreon sends no
   email address at all, so no payment can be matched to an account automatically and every
   one becomes a code you send by hand.

Either way nobody who pays goes without: a payment that cannot be matched appears at
`/admin/codes` under **Waiting to be claimed**, with a code to send them.

### Codes by hand

`/admin/codes` mints them — 7, 30 or 365 days, or any number you type, and any number of uses.
Someone redeems one from the extension popup.

Or give access directly: `/admin/users` → pick the person → **Give access**.

---

## Where things are afterwards

| | |
|---|---|
| `/` | The public site |
| `/privacy` | The policy the Web Store listing points at |
| `/admin` | Overview — what needs attention today |
| `/admin/reports`, `/admin/features` | The two queues, with unread badges |
| `/admin/users` | Accounts, subscriptions, searches, and the levers over them |
| `/admin/codes` | Mint codes; unclaimed payments appear here |
| `/admin/settings` | The donation prompt shown on both surfaces |
| `/admin/api` | What the extension calls |

## When something goes wrong

| Symptom | Almost always |
|---|---|
| Search finds nothing, for everybody | subtitlecat changed their markup. `LIVE=1 npm test` in `web/`, then fix the selectors in `lib/subtitlecat/parse.ts` and deploy. No extension release needed. |
| `/connect` says the extension did not answer | `NEXT_PUBLIC_EXTENSION_ID` does not match the installed extension, or your origin is missing from `externally_connectable.matches`. |
| Sign-in bounces with no error | The Google redirect URI does not match `NEXTAUTH_URL` exactly. |
| Everyone is suddenly locked out of search | `ENFORCE_ENTITLEMENT` was turned on before the new extension build reached people. Unset it. |
| `/admin` refuses you | Your address is not in the `Admin` table on *that* database. |
| `Cannot read properties of undefined` from Prisma | `prisma generate` has not run since the schema changed. |
