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
| `LEMONSQUEEZY_WEBHOOK_SECRET` | Part D. Without it every delivery is refused. |
| `LEMONSQUEEZY_API_KEY` / `LEMONSQUEEZY_STORE_ID` | Part D. Only used to rescue a key we have no record of. |
| `RESEND_API_KEY` / `EMAIL_FROM` | Part D. Without them the trial form cannot send. |
| `IP_HASH_SALT` | Anything long and random |
| `TRIAL_HASH_SALT` | Anything long and random. **Changing it later gives everyone a fresh trial.** |
| `NEXT_PUBLIC_STORE_URL` | The Web Store listing, once step 3 is done |
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

Lemon Squeezy is the shop, and the reason the extension has no sign-in: it generates a
licence key at checkout, emails it to the buyer itself, and stops honouring it when the
subscription ends. Nothing has to be matched up by hand.

### 1. The store and the two products

1. Create a store at [lemonsqueezy.com](https://www.lemonsqueezy.com). It starts in **test
   mode** — stay there until the whole flow works end to end.
2. Create two subscription products: **Monthly** and **Yearly**.
3. On each one, turn **licence keys** on:
   - *Generate licence keys* — **yes**
   - *Activation limit* — **2**, matching the default in `/admin/settings`
   - *Expires with subscription* — **yes**. Without this a cancelled customer keeps a key
     that our database has already stopped honouring, which reads as a bug to them.
4. Copy each product's checkout URL.

### 2. Tell the site about them

`/admin/settings` → **Plans**. Set the price and paste the checkout URL for each. Prices are
entered in currency and stored in cents, and the pricing page reads them on every request —
no deploy, no rebuild.

The trial plan has no checkout URL. It is handled here, not there.

### 3. The webhook

1. Lemon Squeezy → Settings → **Webhooks** → add one at
   `https://your-domain/api/webhooks/lemonsqueezy`.
2. Subscribe to `subscription_created`, `subscription_updated`,
   `subscription_payment_success`, `subscription_expired`, `subscription_cancelled`,
   `license_key_created`.
3. Copy the signing secret into `LEMONSQUEEZY_WEBHOOK_SECRET`.

Then buy your own monthly plan in test mode. You should get an email with a key, see the
licence at `/admin/licenses`, and be able to paste it into the extension popup and search.

**A cancellation does not cut anyone off.** The period already paid for runs out on its own.

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
| A customer's key is refused | Check `/admin/licenses`. If it is not there, the webhook never arrived — the next request they make repairs it automatically, provided `LEMONSQUEEZY_API_KEY` is set. |
| "You are using this key on too many devices" | They are, or they reinstalled twice. Raise the licence's own limit at `/admin/licenses`, which does not touch anyone else's. |
| Trial emails never arrive | The Resend domain is not verified. Nobody has lost their trial — the claim is rolled back with the send. |
| `/admin` sign-in bounces with no error | The Google redirect URI does not match `NEXTAUTH_URL` exactly. |
| Everyone is suddenly locked out of search | `ENFORCE_ENTITLEMENT` was turned on before the new extension build reached people. Unset it. |
| `/admin` refuses you | Your address is not in the `Admin` table on *that* database. |
| `Cannot read properties of undefined` from Prisma | `prisma generate` has not run since the schema changed. |
