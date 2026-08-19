# Plan — de-monetise, fork a Store build, add dual subtitles and a series browser

Status: **proposed, not started.** Review this before any code is written.

---

## 0. What was decided

| Question | Decision |
|---|---|
| How the search-free clone is produced | **Separate folder** `extension-lite/` |
| How far the payment model is removed | **Full removal** — tables dropped, code deleted |
| What goes on the Web Store | **Lite on the Store**, full build downloaded from the website |
| Where TVmaze runs | **Direct from the service worker**, no server hop |

Everything below follows from those four.

---

## 1. The repo, after

```
extension/        the full build — search, TVmaze browser, dual subtitles
                  distributed as a .zip from the website, loaded unpacked
extension-lite/   the Store build — overlay, sync, styling, allowlist, dual subtitles
                  no search, no licence, no account, no server except the donate prompt
web/              the API + public site + admin dashboard
                  no pricing, no trials, no licences, no accounts — donations only
tools/sync-shared.mjs   keeps the files the two extensions genuinely share identical
```

Two extensions, two Web Store identities, two `key.pem` files. They must be able to sit in
one browser at once, so the lite build gets a **freshly generated key** (`npm run key` inside
`extension-lite/`) — reusing `extension/key.pem` gives both the same id and Chrome refuses the
second one.

---

## 2. The one thing that gets *worse*, and how it is handled

Full removal deletes `lib/gate.ts`. That is the only thing standing in front of
`/api/search`, `/api/release` and `/api/download`. Delete it and those three become open,
unauthenticated endpoints on the public internet — anybody who reads the extension's source
gets a free subtitlecat scraping proxy running on your server's bill.

**Mitigation, and it is not optional:** `lib/rateLimit.ts` and the `RateLimit` table survive
the removal, and get re-keyed from *licence* to **`X-Subtitler-Install` + hashed IP**. The
extension therefore keeps sending `X-Subtitler-Install` even though nothing counts devices
any more — it is now the rate-limit key, and that is the reason it still exists.

Concretely, after the change:

- `search:install:<installId>:<hour>` — 60/hour, 300/day, from `SiteSetting` as today
- `search:ip:<ipHash>:<hour>` — a second, looser bucket, because an install id is
  client-supplied and trivially rotated; the IP bucket is what catches someone who does
- a missing or malformed `X-Subtitler-Install` is treated as one shared bucket, not as
  unlimited

This is weaker than a licence check and it is meant to be. It is enough to stop casual abuse
of a free service, which is what the service now is.

---

## 3. Milestone 1 — `web/`: strip the money model, add donations

### 3.1 Deleted outright

**Library:**
`lib/entitlement.ts`, `lib/entitlement.test.ts`, `lib/license.ts`, `lib/license.test.ts`,
`lib/gate.ts`, `lib/requireUser.ts`, `lib/customers.ts`, `lib/users.ts`,
`lib/deviceSignal.ts`, `lib/email.ts`

**Routes:**
`app/api/trial/route.ts`, `app/api/me/route.ts`, `app/api/account/device/route.ts`,
`app/api/admin/licenses/route.ts`, `app/api/admin/users/[id]/route.ts`

**Pages:**
`app/(site)/pricing/*`, `app/(site)/account/*`, `app/(site)/signin/*`,
`app/admin/licenses/*`, `app/admin/users/*`

**Components:** `components/UpgradeBanner.tsx` (reborn as `DonateBanner.tsx`)

### 3.2 Database migration — `drop_money_model`

Dropped tables: `User`, `Entitlement`, `License`, `LicenseActivation`, `TrialClaim`,
`Plan`, `DeviceSignal`.
Dropped enums: `UserStatus`, `EntitlementSource`, `LicenseSource`, `LicenseStatus`,
`PlanInterval`.

`SearchLog` **survives** — it is the only view of what people actually look for, and that is
worth more now, not less. It loses `userId` and the `User` relation; `installId`, `ipHash`,
`query`, `language`, `outcome`, `cached` all stay. The `DENIED` value of `SearchOutcome`
stays too and now means "rate-limited" rather than "unsubscribed".

`SiteSetting` loses `defaultDeviceLimit` and `trialDays`, keeps `searchPerHour` /
`searchPerDay`, and the four `prompt*` columns are renamed to `donate*`:

```prisma
model SiteSetting {
  id String @id @default("singleton")

  donateEnabled Boolean @default(false)
  donateHeading String  @default("Support the extension")
  donateMessage String  @default("This is free and has no ads. If it saved you an evening, a coffee helps keep the server on.")
  donateColor   String  @default("#38bdf8")

  searchPerHour Int @default(60)
  searchPerDay  Int @default(300)

  updatedAt DateTime @updatedAt
}
```

New table — this is what makes the donation links admin-editable:

```prisma
/// One "give me money" button, editable at /admin/donations.
///
/// A table rather than columns on SiteSetting because the number of places you can be paid
/// changes, and adding PayPal beside Ko-fi should not be a migration.
///
/// `url` is validated with lib/donate.ts#safeUrl on write — http/https only. These URLs are
/// rendered inside *other people's pages* by the extension panel, so a `javascript:` here
/// would be script execution on every site the extension touches.
model DonationLink {
  id String @id @default(cuid())

  /// paypal | kofi | buymeacoffee | patreon | github | liberapay | custom
  /// Free text: it only picks an icon and a default colour, and an unknown value falls
  /// back to a generic one rather than failing.
  provider String
  /// What the button says, e.g. "Buy me a coffee".
  label    String
  url      String

  visible   Boolean @default(true)
  sortOrder Int     @default(0)

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([visible, sortOrder])
}
```

`prisma/seed.mjs` seeds the `Admin` row (unchanged) and stops seeding `Plan`. It seeds no
donation links — an empty list renders nothing, which is the correct state before you have
signed up anywhere.

### 3.3 `lib/announcement.ts` → `lib/donate.ts`

This file is *kept*, renamed, and is the best-shaped thing to survive the removal.
`safeColor`, `safeMessage` and `safeUrl` are exactly the validators the donation links need,
for exactly the reason the comments already give. What changes:

- `announcementFor(entitled)` → `donatePrompt()`. The `entitled` parameter disappears —
  there is nobody to exempt, everyone sees it.
- it now also reads `DonationLink` rows, filters `visible`, sorts by `sortOrder`, and runs
  every `url` through `safeUrl`, dropping any that fail rather than rendering a dead button.

### 3.4 API changes

```
GET  /api/search?q=&lang=&page=      unchanged shape; gate replaced by rate limit
GET  /api/release?path=&lang=        same
GET  /api/download?path=             same
GET  /api/donate                     replaces /api/announcement
POST /api/feedback                   unchanged
DELETE /api/me, /api/trial, /api/account/device
```

`/api/donate` is public, cached 60s, and never refuses:

```ts
export interface DonatePrompt {
  enabled: boolean;
  heading: string;
  message: string;
  /** Validated #rrggbb server-side. Only ever an inline style value. */
  color: string;
  links: { provider: string; label: string; url: string }[];
}
```

This shape goes into **`web/lib/api-types.ts` and both extensions' copies**, in the same
commit — the contract rule in the root `CLAUDE.md` still applies, and now applies to three
copies rather than two. `tools/sync-shared.mjs` (§7.2) will enforce it mechanically.

`ApiErrorCode` shrinks. Gone: `not_signed_in`, `unknown_key`, `device_limit`,
`no_subscription`, `subscription_expired`, `account_disabled`. Kept: `rate_limited`,
`bad_request`, `upstream`, `server`. `ApiError.action` **stays** — it is still how the server
tells the client "here is a button", and it is now how a rate-limit refusal can point at the
donate page without an extension update. `MeResponse` is deleted.

### 3.5 Public site

- `/pricing` deleted; **`/donate` created** in its place — the heading, the message and the
  buttons from the database, plus a plain paragraph saying the extension is free and always
  will be. `next.config.ts` gets a permanent redirect `/pricing → /donate` so anything
  already linking there does not 404.
- `SiteHeader` nav: `Pricing` → `Donate`. `SiteFooter`: same swap.
- `app/(site)/page.tsx` and `lib/features.ts`: remove every sentence that frames search as
  paid. `features.ts` is the single source the home page, the guide and the Store listing all
  read from — this is the one place to fix the wording.
- `DonateBanner` replaces `UpgradeBanner` in `app/(site)/layout.tsx`.
- **A download page for the full build** — see §7.4.
- `/privacy` is rewritten in the same commit, per the root `CLAUDE.md` rule. It gets
  considerably shorter: no accounts, no email addresses, no device fingerprints, no licence
  keys. What remains: the anonymous install id, a hashed IP, and search queries.

### 3.6 Admin

`AdminNav`: `Licences` → `Donations`. `Users` is removed. Final rail:
Overview · Bug reports · Requests · **Donations** · Settings · API reference.

`/admin/donations` — a list of `DonationLink` rows with add / edit / reorder / hide, plus the
prompt heading, message and colour that ride along with them. One page, because a donation
link and the sentence next to it are one editorial decision.

`/admin` overview loses its subscriber and revenue tiles and keeps searches, submissions and
top queries. `/admin/settings` loses the trial and device-limit fields.

`app/api/admin/donations/route.ts` — `requireAdmin()` on every method, as every
`/api/admin/*` route already does, because middleware only covers `/admin/*` pages.

`lib/authOptions.ts` keeps the Google provider and the `Admin`-table check, and drops
`upsertCustomer` / `grantSignupTrial`. Sign-in returns to admin-only, which is what the
`CLAUDE.md` already describes as its resting state.

### 3.7 Environment

`.env.example` loses `RESEND_API_KEY`, `EMAIL_FROM`, `TRIAL_HASH_SALT` and
`ENFORCE_ENTITLEMENT`. `IP_HASH_SALT` **stays** — it now salts the rate-limit IP hash, which
is the last thing using it. `NEXTAUTH_SECRET` and the two Google values stay for `/admin`.

---

## 4. Milestone 2 — `extension/`: remove the licence, keep the install id

Small, and it must land before the fork.

**Deleted:** `src/background/auth.ts`, `src/popup/LicenseBox.tsx`,
`src/panel/components/AccountLine.tsx`.

**`src/types.ts`:** the `auth:state` / `auth:set-key` / `auth:clear` variants go; the
`announcement` variant is renamed `donate`. The `switch` in `service-worker.ts` has no
`default` case on purpose, so the compiler will point at every site that needs updating —
that property is the reason this edit is safe.

**`src/lib/api.ts`:** `X-Subtitler-Key` disappears from **both** fetch call sites — the
obvious one and the hand-rolled one inside `downloadSubtitle`, which the `CLAUDE.md` already
flags as the easy one to miss. `X-Subtitler-Install` stays on both, and the comment above it
changes from "the device limit counts this" to "the rate limiter keys on this".

**`src/panel/store.ts`:** `FindState.code` narrows to the surviving `ApiErrorCode` values.
The refusal-rendering path in `FindTab` stays exactly as it is — it renders whatever the
server said, which is still the right design and now covers rate limits instead of paywalls.

**`src/popup/Popup.tsx`:** the licence box and `pricingUrl` come out; a small "Support this
extension" line goes in, fed by the same `/api/donate` response the panel uses.

**`PanelBanner`** already renders an admin-supplied message, colour and link. It keeps
working unchanged against `DonatePrompt`, showing the first visible donation link as its
button.

---

## 5. Milestone 3 — dual subtitles

Full build first. It touches `types.ts`, `storage.ts`, `style.ts`, `overlay.ts`, `store.ts`
and three panel tabs. None of it touches search, licensing or the allowlist.

### 5.1 Types

```ts
/** Which of the two subtitle tracks something refers to. */
export type SlotId = 0 | 1;

/** One of the two tracks, with its own timing. They are synced independently. */
export interface TrackSlot {
  track: SubtitleTrack | null;
  sync: SyncState;
  visible: boolean;
}

/** Where the two blocks sit relative to each other. */
export interface DualLayout {
  enabled: boolean;
  /** Vertical gap between the blocks, as a percentage of overlay height. */
  gapPct: number;
  /** Which block sits above the other. Primary is at the bottom by default. */
  order: 'secondary-above' | 'secondary-below';
}
```

The transform stays per-slot and unchanged: `shownAt = cue.start * scale + offset`. Two
`SyncState`s, two independent fits. The whole existing sync toolkit — one-point anchor,
two-point drift fit, the FPS snap, the ≥60 s anchor guard, the `[0.9, 1.1]` scale clamp —
applies to each slot without modification, because it is already pure and slot-agnostic.

### 5.2 Layout — the actual rendering change

Today the overlay's shadow root holds one absolutely-positioned `.cues` div at
`bottom: bottomPct%`. That becomes a **stack**:

```
.stack {
  position: absolute;
  bottom: <bottomPct>%;
  left: 50%;
  transform: translateX(-50%);
  max-width: <maxWidthPct>%;
  display: flex;
  flex-direction: column-reverse;   /* primary at the bottom */
  align-items: center;
  gap: <gapPct>% of overlay height, in px;
}
.stack > .cues-primary   { ... }
.stack > .cues-secondary { ... }
```

`column-reverse` with primary first in the DOM puts the primary line at the bottom and the
secondary directly above it — subtitles growing upward from the same baseline, which is what
every dual-subtitle player does and what keeps the primary line from jumping when the
secondary is two lines long instead of one. `order: 'secondary-below'` flips to `column`.

The host element, its rect tracking, the letterbox maths, the fullscreen re-parenting and the
`ResizeObserver` are all **untouched** — both blocks live inside the one host, so every
gotcha already solved stays solved. This is the reason to stack inside the existing overlay
rather than mount a second one.

`bottomPct`, `maxWidthPct` and `anchorTo` describe where the *stack* sits and are read from
the primary style only. The secondary style's copies of those three fields are ignored, and
the Style tab hides them when you are editing the secondary.

### 5.3 Overlay API

```ts
setTrack(slot: SlotId, track: SubtitleTrack | null): void
setSync(slot: SlotId, sync: SyncState): void
setVisible(slot: SlotId, visible: boolean): void
setStyles(styles: [SubtitleStyle, SubtitleStyle], layout: DualLayout): void
```

Internally: two `CueLookup`s, two `paintedKey`s, two container elements. `render()` resolves
both slots per frame and repaints only the container whose active-cue key changed. Two
cursor-cached binary searches per frame instead of one — the existing `CueLookup` is O(1)
amortised on sequential playback, so the cost is not measurable.

The `requestVideoFrameCallback` loop, the `VIDEO_EVENTS` list and the paused-seek handling
are unchanged.

### 5.4 Storage

**Style** — `storage.sync` gains two keys beside the existing `style`:

- `style` — the primary, unchanged shape, so a style saved by today's version still loads
- `style2` — the secondary, defaulting to a copy of the primary with `fontSizePct × 0.8` and
  a dimmer colour
- `dual` — the `DualLayout`

No migration: `loadStyle` already merges over `DEFAULT_STYLE`, so an old stored object is
forward-compatible by construction, and a missing `style2` / `dual` falls back to defaults.

**Per-film** — `MovieState` grows a `slots` field and keeps the old one readable:

```ts
export interface MovieState {
  slots: [SlotSave, SlotSave];
  updatedAt: number;

  /** @deprecated pre-dual saves. Read by loadMovie, never written. */
  sync?: SyncState;
  track?: SubtitleTrack | null;
}
```

`loadMovie` lifts a legacy `{ sync, track }` into `slots[0]` and leaves `slots[1]` empty —
the same forward-compatibility trick the language loader already uses for the old `langs`
array. Nobody's saved timing is lost.

**Quota:** two tracks per film roughly doubles per-film storage against the 10 MB
`storage.local` cap. The existing fallback in `saveMovie` — drop the cues, keep the timing —
already handles the failure correctly, and `MAX_REMEMBERED_MOVIES` drops from 20 to 12 so it
is reached less often.

### 5.5 Panel

A `dual` toggle at the top of the **File** tab. Off, the panel is identical to today —
this feature costs nothing in the single-track case, which matters because most sessions are
single-track.

On, a two-button **Primary / Secondary** selector appears in the panel header, below the
tabs. It sets `activeSlot`, and **File**, **Find** and **Sync** all act on the active slot:

- **File** — the dropzone loads into the active slot. Both loaded tracks are listed with
  their own name, line count, encoding, show/hide and remove.
- **Find** — searching and loading a result goes into the active slot. The language picker
  is per-slot, so `en` for primary and `de` for secondary is one click each, and the second
  search reuses the query already in the box.
- **Sync** — the cue list, the click-to-sync mode, the anchors, the nudge buttons and the
  drift fit all operate on the active slot, unchanged. The other slot's timing is untouched
  while you work.
- **Style** — the same Primary / Secondary selector, editing `style` or `style2`. When
  Secondary is active, `bottomPct` / `maxWidthPct` / `anchorTo` are replaced by the
  `gapPct` and `order` controls from `DualLayout`, because those are the only positional
  choices a secondary block has.

`PanelPrefs.tab` is unchanged; `activeSlot` is session state, not persisted — you always
come back to the primary.

### 5.6 Should lite get this too?

**Recommendation: yes.** Dual subtitles touches no search code, no server and no credential.
It is a pure overlay feature, it is the single strongest thing the Store listing can claim,
and language-learners are the audience most likely to install it. Withholding it from the
Store build buys nothing.

The cost is that `store.ts` diverges between the two folders and the slot logic lives there.
Mitigation: the slot reducers move into a pure `src/lib/slots.ts` that both stores import,
so what actually diverges is the thin wiring, and `sync-shared.mjs` carries `slots.ts` across
verbatim. **This is an open question — say if you would rather keep lite single-track.**

---

## 6. Milestone 4 — the TVmaze series browser

### 6.1 Where it runs

A new `src/lib/tvmaze.ts`, **service worker only**, the same rule and the same reason as
`lib/api.ts`: a content script's `fetch` obeys the *page's* CSP and CORS, so calling TVmaze
from the panel works on your test site and fails on somebody's site with a strict
`connect-src`. The worker's fetch obeys our host permissions, which are already `<all_urls>`.

Three new message kinds in `ToBackground`, three new cases in the router:

```ts
| { kind: 'tv:search'; query: string }        // -> ShowHit[]
| { kind: 'tv:episodes'; showId: number }     // -> SeasonSummary[]
```

Two, in fact — see the next section for why seasons and episodes are one call.

### 6.2 One fetch, not two

The obvious mapping is `/shows/:id/seasons` for the season list and `/shows/:id/episodes`
for the episodes. **Do not use `/seasons` for the counts.** Its `episodeOrder` field is
`null` for a season that has not finished airing, and is the *ordered* count rather than the
number of episodes actually listed — so a currently-airing show shows a blank or a wrong
number in exactly the case somebody is most likely to be watching it.

Instead: fetch `/shows/:id/episodes` once and group by `season`. That gives the season list,
the true episode count per season, every episode's number, name and airdate, and correct
behaviour at season boundaries — from one request rather than two.

```
GET https://api.tvmaze.com/search/shows?q=<query>   -> [{ score, show }]
GET https://api.tvmaze.com/shows/<id>/episodes      -> [{ season, number, name, airdate }]
```

No API key. TVmaze's published limit is roughly 20 calls per 10 seconds per IP, which this
design cannot come close to: the search input is debounced 350 ms, and the episode list is
fetched once per show.

### 6.3 Caching

The service worker is suspended after ~30 s idle and **nothing may assume its in-memory
state survives** — the `CLAUDE.md` is explicit about this and an in-memory cache here would
appear to work in development and miss constantly in real use.

So: `chrome.storage.session` for the show search results (cheap to refetch, and cleared when
the browser closes) and `chrome.storage.local` with a 7-day TTL for episode lists keyed
`tv:eps:<showId>` (an episode list for a finished season does not change, and this is what
makes the Next-episode button instant).

### 6.4 No poster images

TVmaze returns image URLs on `static.tvmaze.com`. The panel renders inside a shadow root
**in somebody else's document**, and images in a shadow root are still subject to the host
page's `img-src` CSP — so posters would load on some sites and silently break on others,
which reads as a bug. The browser is text: show name, premiere year, network, and the
TVmaze status (`Running` / `Ended`). That is enough to pick the right show out of a list.

### 6.5 The UI

A collapsible **Series** section at the top of the Find tab, not a sixth tab — the panel is
340 px wide and clipped to the player iframe, and five tabs is already the practical limit.

```
┌ Find ─────────────────────────────────┐
│ ▾ Series                              │
│   [ Person of Interest        ] [Find]│
│   ● Person of Interest  2011 · CBS    │
│     Ended                             │
│   ○ Person of Interest (2001)  ...    │
│                                       │
│   S1 23 · S2 22 · S3 23 · S4 22 · S5  │
│   E01 E02 E03 [E04] E05 E06 E07 ...   │
│                                       │
│   ‹ Prev   Person of Interest s01e04  │
│                                Next › │
├───────────────────────────────────────┤
│ [ Person of Interest s01e04 ] [ en ▾ ]│
│ [ Search ]                            │
└───────────────────────────────────────┘
```

Flow: type a name → pick a show → season chips appear with real episode counts → pick a
season → episode chips appear → click an episode and the search box becomes
`Person of Interest s01e04` and the search runs. Hovering an episode chip shows its title
and airdate in a `title` attribute.

Query format is `${show.name} s${SS}e${EE}`, lowercase, zero-padded — that is how release
names on subtitlecat are written, which is what the search is matched against.

### 6.6 The memory, and the Next button

This is the part that removes the typing.

```ts
/** storage.local, `tv:recent` — most recent first, capped at 8. */
interface RememberedShow {
  showId: number;
  name: string;
  /** Where you got to. Updated every time you run a search from a chip. */
  season: number;
  episode: number;
  lastUsedAt: number;
}
```

When the panel opens, the Series section shows the most recent show already expanded at its
remembered position — no typing, no searching for the show again. The other seven are a row
of chips above it.

**`Next ›`** takes the remembered `(season, episode)` and advances it *against the real
episode list*, not by arithmetic. So E23 of season 1 becomes S02E01, and a season with 22
episodes and one with 23 both behave correctly — because the actual list is in hand, which
is the payoff for §6.2. It sets the query, runs the search, and writes the new position back
to `tv:recent`. `‹ Prev` is the mirror image. At the end of the last season, `Next` is
disabled rather than wrapping.

The position advances **when you run a search**, not when you load a subtitle — you may
search twice for the same episode before finding a track that fits, and having the counter
run ahead of you would be worse than having to press Next once.

### 6.7 What TVmaze does not cover

TVmaze is television. It has no films, and there is no comparable film database that works
without an API key — the Studio Ghibli API is about twenty titles and is not worth a code
path. So:

- **Series** get the browser above.
- **Films** keep exactly what they have today: the free-text box, seeded from the tab title
  by `guessSearchTitle`. Nothing regresses.

If film metadata matters later, it means TMDb or OMDb and therefore an API key, which means
the call moves behind `web/` so the key is not shipped inside an extension anybody can
unzip. Out of scope here, but the shape of the answer is worth recording.

### 6.8 Lite build

The Series browser exists to compose a search query, and lite has no search. **It is not
ported.** `lib/tvmaze.ts` and the `tv:*` messages exist only in `extension/`.

---

## 7. Milestone 5 — forking `extension-lite/`

Last, deliberately: the fork copies finished code once instead of tracking a moving target.

### 7.1 What is removed from the copy

**Deleted files:** `panel/components/FindTab.tsx`, `panel/components/LanguagePicker.tsx`,
`lib/api.ts`, `lib/languages.ts`, `lib/searchTitle.ts`, `lib/searchTitle.test.ts`,
`lib/tvmaze.ts`.

**`lib/api-types.ts`** is trimmed to `DonatePrompt` alone — lite has no releases, tracks or
search responses.

**`types.ts`:** the `api:*` and `tv:*` variants go. `donate` and `get-page-title` stay
(the latter feeds the panel header, not the search box).

**`panel/store.ts`:** `FindState` and every find action are removed. Everything else — the
slots, the sync actions, the style actions, the prefs — is identical.

**`App.tsx`:** four tabs — `File · Sync · Style · Sites`.

**`manifest.config.ts`:** a new `key` from `npm run key` (§1), a name and a description with
no mention of finding subtitles online.

### 7.2 `tools/sync-shared.mjs` — the answer to duplication

A separate folder means every overlay fix, every sync fix, every allowlist fix has to be made
twice, and the root `CLAUDE.md` already warns what happens to files that are meant to match
and are not enforced. So they get enforced.

```
node tools/sync-shared.mjs           copy extension/ -> extension-lite/ for the shared list
node tools/sync-shared.mjs --check   exit 1 if any shared file differs   (runs in npm run check)
```

**Synced verbatim** — the files that have no business differing:

```
src/lib/subtitles/*      src/lib/sync.ts       src/lib/sites.ts
src/lib/style.ts         src/lib/storage.ts    src/lib/videoKey.ts
src/lib/log.ts           src/lib/messaging.ts  src/lib/slots.ts
src/content/*            src/styles/*
src/panel/components/{ui,StyleTab,SyncTab,SubtitlesTab,SitesEditor,SitesTab,PanelBanner}.tsx
```

**Explicitly excluded**, because they are supposed to differ:
`types.ts`, `panel/store.ts`, `panel/App.tsx`, `popup/*`, `manifest.config.ts`,
`package.json`, `lib/api-types.ts`.

The workflow becomes: fix it in `extension/`, run the sync, commit both. `--check` in
`npm run check` means a forgotten sync fails the build rather than shipping a bug that was
already fixed once.

### 7.3 The Web Store review risk that is *not* the search feature

Worth saying plainly before you build to this plan: removing subtitle search may not be
sufficient on its own. `<all_urls>` host permission combined with `all_frames: true` and
`document_start` draws scrutiny regardless of what the extension does with it, and the
justification — "the film is in a cross-origin iframe on a rotating domain" — is true and
also exactly what a reviewer reads as broad access.

If lite is still rejected, the next lever is already implied by the architecture:

- move `<all_urls>` from `host_permissions` to **`optional_host_permissions`**
- ship with no host access at all; the popup requests it **per origin** at the moment the
  user allows a site, via `chrome.permissions.request({ origins: ['*://*.example.com/*'] })`
- the runtime allowlist gate stays as it is — it becomes the *mirror* of the granted
  permissions rather than the only thing narrowing them

That is a genuinely reviewable design and a much easier listing to defend. It is **not** in
this plan's scope because it is a real piece of work and only worth doing if the simple
listing fails. Plan it as the contingency, not the first attempt.

### 7.4 Distributing the full build

`web/app/(site)/download/page.tsx` — the full build as a `.zip`, with the four-step
"unzip, chrome://extensions, Developer mode, Load unpacked" walkthrough and a plain
statement that it does not auto-update.

The `.zip` is a build artefact, not a committed file. It is `extension/dist/` zipped and
dropped in `web/public/downloads/`, with the version in the filename so a stale browser
cache does not hand somebody last month's build.

---

## 8. Order of work, and what each commit looks like

| # | Milestone | Depends on | Commits (roughly) |
|---|---|---|---|
| 1 | `web`: drop the money model | — | `drop the entitlement and licence model`, `add editable donation links`, `rewrite the privacy policy` |
| 2 | `web`: rate limit on install id + IP | 1 | `key rate limits on the install id` |
| 3 | `extension`: remove the licence | 1 | `remove the licence key`, `show the donation prompt` |
| 4 | `extension`: dual subtitles | 3 | `add a second subtitle slot`, `stack the two subtitle blocks`, `style the secondary track` |
| 5 | `extension`: TVmaze browser | 3 | `add the tvmaze series browser`, `remember where you got to in a series` |
| 6 | fork `extension-lite/` | 4, 5 | `fork the search-free build`, `add the shared-file sync check` |
| 7 | `web`: download page + docs | 6 | `add the full-build download page`, `rewrite SETUP.md` |

Each of these builds and passes `npm run check` on its own, per the extension's committing
rule. Milestones 4 and 5 are independent of each other and could be done in either order.

`SETUP.md` needs a real rewrite at step 7 — its Part C is currently four ordered steps built
entirely around turning enforcement on, and enforcement will not exist. The new ordering is:
deploy `web`, repoint the extensions' `apiBase`, publish lite, publish the full-build zip.

---

## 9. Testing

**Extension (vitest, pure logic only — the DOM parts go through the local harness):**

- `lib/slots.ts` — loading into a slot leaves the other slot's track and timing untouched
- `lib/storage.ts` — a legacy `MovieState` loads into slot 0 with slot 1 empty
- `lib/tvmaze.ts` — grouping a flat episode list into seasons; a season with a gap in the
  numbering; **next/previous across a season boundary in both directions**; next at the
  final episode is a no-op
- `lib/tvmaze.ts` — query formatting: zero-padding, a show name containing a colon or an
  apostrophe

**Overlay and layout** through `npm run dev` + `http://localhost:5173/test/local.html`, with
a second sample track added — `test/sample-de.srt` alongside the existing `sample.srt` and
`sample-drift.srt`, generated by the same `test/generate-samples.mjs`. Specifically check:
fullscreen with both blocks visible, one block empty while the other has a cue (the stack
must not jump), and a three-line secondary under a one-line primary.

**Web:** `entitlement.test.ts` and `license.test.ts` are deleted with their subjects. New:
`donate.test.ts` for `safeUrl` (a `javascript:` link is dropped, a protocol-relative one is
dropped, an `http` one survives) and a rate-limit test for a missing install id landing in
the shared bucket rather than being waved through.

**Cross-cutting:** `node tools/sync-shared.mjs --check` in both extensions' `npm run check`.

---

## 10. Open questions — none of these block a start

1. **Names.** The Store build wants the clean name. Proposal: lite is
   **"Subtitle Synchronizer"**, full is **"Subtitle Synchronizer (Full)"** and is never
   listed publicly under that name.
2. **Does lite get dual subtitles?** Recommended yes (§5.6) — say if not.
3. **Which donation providers to seed?** PayPal, Ko-fi and Buy Me a Coffee are the three
   with the lowest friction for a browser-extension audience; Patreon suits recurring
   support and is worth adding only if you intend to post there. Nothing needs to be
   decided before the code — the table is empty until you add rows.
4. **`SearchLog`** — kept, install-scoped (§3.2). It is the only signal about what people
   want. Say if you would rather it went with the accounts.
5. **The query-format toggle** (`s01e04` vs `1x04` vs `Season 1 Episode 4`) — left out for
   now; `s01e04` matches how subtitlecat names releases. Cheap to add later if searches miss.
6. **`/pricing`** redirects to `/donate` rather than 404ing. Say if you would rather it
   simply disappeared.
