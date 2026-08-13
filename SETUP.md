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
  generates its own instead, the published extension gets a different id from the one you
  have been testing, and anything keyed to the old id — an existing install, a bookmark,
  a support note — points at nothing.

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
| `NEXT_PUBLIC_SITE_URL` | `https://your-domain` — used to build the links the extension opens |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | From the OAuth client. These gate `/admin` and nothing else. |
| `DEVICE_HASH_SALT` | Generate one. See below. Salts the sign-in device fingerprint. |
| `RESEND_API_KEY` / `EMAIL_FROM` | Part D. Without them the trial form cannot send. |
| `IP_HASH_SALT` | Generate one. See below. |
| `TRIAL_HASH_SALT` | Generate one. See below. **Changing it later gives everyone a fresh trial.** |
| `NEXT_PUBLIC_STORE_URL` | The Web Store listing, once step 3 is done |
| `ENFORCE_ENTITLEMENT` | **Leave unset for now.** Step 4 turns it on. |

Four of those you generate rather than fetch from anywhere — `NEXTAUTH_SECRET`,
`TRIAL_HASH_SALT`, `IP_HASH_SALT` and `DEVICE_HASH_SALT`:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Run it **once per variable**, and use fresh values here rather than the ones from your
development `.env`. Each is a separate secret with a different blast radius:
`NEXTAUTH_SECRET` signs the session cookie, `TRIAL_HASH_SALT` decides whether an address has
already used its trial, `IP_HASH_SALT` salts abuse-detection history, and `DEVICE_HASH_SALT`
salts the sign-in device fingerprint. Reusing one value across all four means you can never
rotate the harmless one without also signing everyone out and reissuing every trial.

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
   redirect URIs. Keep the localhost one so development still works. This is for *your*
   access to `/admin`; customers never sign in to anything.
2. **Where the extension points** — either change `DEFAULT_API_BASE` in
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

**There is no payment provider wired up.** Lemon Squeezy was removed after they declined the
product, and nothing has replaced it yet. Everything else in this part still works: people can
sign in, take a trial, hold a licence key and be gated on it — access is simply granted by
hand until a provider is chosen.

### 1. Granting access without a provider

`/admin/users` → pick the account → **Give or take access**. That writes an `ADMIN`
entitlement, which the gate honours exactly like a purchased one. Issue them a key from
`/admin/licenses` and they can paste it into the extension.

Fine for a handful of people. It does not scale, and it is not meant to.

### 2. Wiring up a replacement

The money model was built so the provider is a seam rather than a rewrite. What survived
Lemon Squeezy's removal untouched: the entitlement ledger, the licence keys, the device limit,
the gate, the plans, and the extension.

A replacement has to supply three things:

- **A webhook route** under `app/api/webhooks/<provider>/`, verifying the signature over the
  **raw** request body — read `request.text()` once and check those bytes, never a
  re-serialised object. It calls `grant()` with the provider's own event id as the
  `dedupeKey`, which is what makes a replayed delivery harmless.
- **A key-validation call**, so an unknown key can be checked once against the provider
  before being refused. `lib/license.ts` keeps a note where `recoverLicense()` used to live.
  Skipping this means a lost webhook is a paying customer whose key does not work.
- **A checkout URL per plan**, pasted at `/admin/settings` → **Plans**, not hardcoded.

Whichever provider it is, two rules carry over. **A cancellation does not cut anyone off** —
the period already paid for runs out on its own; revocation is for chargebacks. And prices
live in the database, so a change is a form submission rather than a deploy.

### 3. Tell the site about the plans

`/admin/settings` → **Plans**. Set the price and paste the checkout URL for each. Prices are
entered in currency and stored in cents, and the pricing page reads them on every request —
no deploy, no rebuild.

The trial plan has no checkout URL. It is handled here, not there.

### 4. Resend, for trial keys

1. [resend.com](https://resend.com) → add your domain → add the DNS records it asks for.
2. Create an API key; put it in `RESEND_API_KEY`.
3. Set `EMAIL_FROM` to an address at the verified domain.

Until the domain verifies, the trial form returns "we could not send the email" and **does
not consume the trial** — the claim, the licence and the entitlement are all rolled back
together, so the person can ask again once it works. Test that before launch by requesting a
trial with the key deliberately unset.

### Giving access by hand

`/admin/licenses` → **Issue a key** mints one against any address, for any number of days —
for a refund, a reviewer, or somebody a webhook lost. `/admin/users` → **Give access** grants
time without issuing a key.

## Where things are afterwards

| | |
|---|---|
| `/` | The public site |
| `/pricing` | The plans, the trial form, and why search costs anything |
| `/privacy` | The policy the Web Store listing points at |
| `/admin` | Overview — what needs attention today |
| `/admin/reports`, `/admin/features` | The two queues, with unread badges |
| `/admin/users` | Accounts, subscriptions, searches, and the levers over them |
| `/admin/licenses` | Every key, its owner, its devices; mint one by hand |
| `/admin/settings` | Plans and prices, the upgrade prompt, rate and device limits |
| `/admin/api` | What the extension calls |

## When something goes wrong

| Symptom | Almost always |
|---|---|
| Search finds nothing, for everybody | subtitlecat changed their markup. `LIVE=1 npm test` in `web/`, then fix the selectors in `lib/subtitlecat/parse.ts` and deploy. No extension release needed. |
| A customer's key is refused | Check `/admin/licenses`. If it is not there, nothing will repair it on its own — the self-healing recovery path went with Lemon Squeezy. Grant access at `/admin/users` and issue a key by hand. |
| "You are using this key on too many devices" | They are, or they reinstalled twice. Raise the licence's own limit at `/admin/licenses`, which does not touch anyone else's. |
| Trial emails never arrive | The Resend domain is not verified. Nobody has lost their trial — the claim is rolled back with the send. |
| `/admin` sign-in bounces with no error | The Google redirect URI does not match `NEXTAUTH_URL` exactly. |
| Everyone is suddenly locked out of search | `ENFORCE_ENTITLEMENT` was turned on before the new extension build reached people. Unset it. |
| `/admin` refuses you | Your address is not in the `Admin` table on *that* database. |
| `Cannot read properties of undefined` from Prisma | `prisma generate` has not run since the schema changed. |
