# Subtitler Extension (isolated)

A Chrome/Edge (Manifest V3) extension that overlays user-supplied `.srt` / `.vtt` subtitles onto
any HTML5 video playing in the browser, with a click-to-sync tool for realigning a mistimed track.

**This is the build that needs no server.** It began as a copy of `extension/` and differs in
one thing: subtitle search talks to subtitlecat directly from the service worker instead of
through the `web/` API. No container, no database, nothing to deploy, nothing of ours to keep
running — install it and search works. What that costs, and how the cost is paid, is the
*Subtitle search* section below. Everything else in this file is true of `extension/` too.

It is **a fork, not a synced copy**. `tools/sync-shared.mjs` does not touch this folder;
a fix that belongs in all three builds is made here *and* in `extension/` by hand.

Built for streaming sites that ship no subtitle track of their own — `hdfilme.to`,
`serienstream.to`, `aniworld.to` and friends, which rotate domains freely (`.win` → `.best` →
`.to`, …). It runs only on the sites in the user's allowlist; a rotated domain is added from the
toolbar popup.

---

## The one thing to understand before touching this code

The video is **not reachable by URL**. Do not write code that tries.

The target site embeds a **JW Player inside a cross-origin iframe** (`dr0pstream.com`), and the
player's element looks like this:

```html
<video class="jw-video jw-reset" src="blob:https://dr0pstream.com/8150fdb4-…"></video>
```

A `blob:` src means **MSE (MediaSource Extensions)**: `hls.js` fetches `.ts` segments over XHR and
pushes them into a buffer that exists only in that page's JavaScript heap. Consequences:

- There is no URL that plays this stream. Not in VLC, not in a `<video>` you create, not anywhere.
  (The underlying `.m3u8`/`.ts` URLs are additionally signed — `t=<token>&s=<epoch>&e=14400`,
  bound to referer/IP with a 4-hour expiry — so they 403 outside the page anyway.)
- **The network layer is therefore irrelevant to the feature.** Subtitles are a DOM overlay
  driven by `video.currentTime`. Nothing else is needed.
- The only genuinely hard problem is *reaching* the `<video>` element, because it lives in a
  cross-origin child frame. Hence: inject into all frames, render the overlay in the frame that
  owns the video, and drive it from a panel in the top frame via the service worker.

The iframe chain, for orientation:

```
hdfilme.to  →  <iframe id="_player" src="//dropload.co/embed-<id>.html">
            →  dr0pstream.com/embed-<id>.html  →  <video src="blob:…">
```

The same `<id>` appears in both URLs, so `dropload.co` almost certainly redirects to
`dr0pstream.com` — one iframe that navigates, rather than two nested ones. Either way
`all_frames: true` covers it, and the outer iframe carries `allowfullscreen`, so fullscreen
propagates to the frame that owns the video, and therefore to our overlay.

### Invariants

1. **No code may depend on the media URL, the manifest, or the segments.** If a feature seems to
   need them, the design is wrong.
2. **The overlay _and the panel_ render in the video's own frame.** An overlay in the top frame
   cannot sit on top of content inside a cross-origin iframe, and — the decisive part — when a
   child frame goes fullscreen, the top document's `fullscreenElement` is the `<iframe>` element
   itself. Nothing outside it renders, and you cannot append DOM into a cross-origin iframe. So a
   top-frame panel would vanish the moment the user goes fullscreen, which is exactly when the
   sync tool is needed. Both UI surfaces therefore live in whichever frame owns the video.

   The upside: panel and overlay are in the same JavaScript context, so they call each other
   directly. No cross-frame messaging is involved in subtitle state at all.

   The cost: the panel is clipped to the player iframe's viewport in windowed mode. That's why it
   is a compact, draggable, collapsible window rather than a sidebar.
3. **No page-world script injection.** Content scripts run in an isolated world, which is enough:
   we only need the raw `<video>` element, never JW Player's JS API. Staying out of the page world
   sidesteps the site's CSP entirely.
4. **Nothing runs on a site the user has not allowed.** The content script is injected everywhere
   and gates itself at runtime against the allowlist (`src/lib/sites.ts`). Without that gate the
   panel would appear over every video on the web, which is what the allowlist was added to stop.

### Scope boundary

This overlays text on video the user is already playing in their own browser, and fetches
*subtitle text files* from a public subtitle site at the user's request. It does not download,
decrypt, deobfuscate, record, or redistribute **media**, and must not grow features that do.
Subtitles are text the user asked for by name; the video is not, and is not touched.

---

## Stack

| | |
|---|---|
| Platform | Chrome / Edge, Manifest V3 |
| Language | TypeScript (strict) |
| Build | Vite + `@crxjs/vite-plugin` v2 |
| UI | React 18 + Tailwind, mounted into shadow DOM |
| State | `zustand` (panel only) |

No other runtime dependencies. The cue-list virtualization is hand-rolled (~30 lines) rather than
pulling in `react-window`.

## Commands

```bash
npm install
npm run dev      # Vite watch + HMR for the panel UI
npm run build    # production build into dist/
npm run test     # vitest: parser, timing maths, cue lookup, allowlist matching
npm run check    # typecheck + tests + build + verify, i.e. everything
npm run verify   # assert dist/ is loadable — see the entry-basename gotcha
npm run icons    # regenerate public/icons/* from tools/make-icons.mjs
```

Tests cover the pure logic — `lib/subtitles/parse.ts`, `lib/sync.ts`, `lib/subtitles/lookup.ts`,
`lib/sites.ts`, `lib/searchTitle.ts`, and now `lib/subtitlecat/*` — because those are where a
subtle error is invisible on screen. The DOM-facing parts (overlay positioning, detection) are
verified through the harness instead. The subtitlecat parser runs under `happy-dom` in tests
and under the offscreen document's `DOMParser` in the extension; it sees a `Document` either way.

```bash
LIVE=1 npm test  # also parse the real subtitlecat with the bundled selectors
```

The Find tab needs nothing running. `LIVE=1` is the first thing to run when someone reports
that search finds nothing — it says within seconds whether subtitlecat changed their markup.

## Committing

**Commit and push after each batch of work.** A batch is one coherent change — a feature, a fix, a
refactor — not a whole session's worth. Don't let finished work sit uncommitted.

Run `npm run check` before committing. Every commit should build and have passing tests; a broken
commit makes `git bisect` useless later.

Messages are short, simple and clear:

- imperative mood, lowercase, no trailing full stop — `add drift fix`, not `Added drift fix.`
- one line, roughly 50 characters, saying *what changed*
- a body only when the *why* isn't obvious from the diff — then one blank line, then prose

```
add two-point drift fix to sync tool
fix overlay vanishing in fullscreen
lazy-load panel to keep content script small
```

Avoid `update code`, `fixes`, `wip`, and anything that restates the file name. If a message needs
"and" in it, it is probably two commits.

---

**Loading it:** `chrome://extensions` → enable Developer mode → *Load unpacked* → select `dist/`.
After a rebuild, hit the reload icon on the extension card, then reload the page under test —
old content scripts do not survive an extension reload (see gotchas).

**Shortcuts:** `Alt+Shift+S` toggles the panel, remappable at `chrome://extensions/shortcuts`.
The toolbar icon opens the popup, which is where sites are allowed.

**Icons:** `public/icons/` — generated by `npm run icons` from `tools/make-icons.mjs`, which draws
the mark procedurally so the whole set stays consistent. To use different artwork, just overwrite
the four PNGs; nothing but that script reads the SVG.

**Developing offline:** run `npm run dev` and open <http://localhost:5173/test/local.html>. It
generates a `blob:`-backed video (via canvas + MediaRecorder), which is the same shape as the
real site's MSE player, and embeds a nested iframe with a second one. Detection, overlay, styling
and sync can all be exercised there without the site being up. Only genuine *cross-origin* iframe
behaviour requires the real site.

The clip has a clock burned into it, and `test/sample.srt` announces in each cue the timecode it
should appear at — so timing errors are visible rather than a matter of judgement.
`test/sample-drift.srt` carries the same lines authored at 25 fps instead of 23.976, which is the
fixture for the two-point drift fit. Both are produced by `node test/generate-samples.mjs`.

Serving over `http://localhost` rather than `file://` is deliberate: file URLs need the extension's
"Allow access to file URLs" toggle turned on, which is easy to forget and looks exactly like a
detection bug. `localhost` is in the default allowlist for the same reason — otherwise the harness
would come up dead and look like one too.

---

## Structure

```
src/
  manifest.config.ts     MV3 manifest, authored as TypeScript
  types.ts               Cue, SyncState, TrackSlot, DualLayout, SubtitleStyle, the message unions

  lib/
    subtitles/parse.ts   parseSRT / parseVTT / sniffFormat / decode with encoding fallback
    subtitles/lookup.ts  cursor-cached binary search over sorted cues
    sync.ts              applyTransform, onePointAnchor, twoPointFit, FPS_RATIOS
    slots.ts             the two subtitle slots as pure data — no React, no chrome.*
    tv.ts                seasons, episodes, next/previous, query formatting — pure
    tvmaze.ts            the TVmaze client and its caches — SERVICE WORKER ONLY
    style.ts             DEFAULT_STYLE, the clamps, and the stack + per-block CSS
    sites.ts             the allowlist: normalising, matching, storage, top-host resolution
    api.ts               subtitle search: fetch subtitlecat, cache, answer the panel — SERVICE WORKER ONLY
    api-types.ts         the shapes the panel consumes; began as web/lib/api-types.ts, no longer tied to it
    languages.ts         copy of web/lib/languages.ts — keep identical
    donate.ts            validators for the donation prompt — pure, see below
    subtitlecat/
      config.ts          RemoteConfig, DEFAULT_CONFIG (selectors, site, donate), readConfig — pure
      remote.ts          fetching and caching remote/config.json — SERVICE WORKER ONLY
      http.ts            fetchText, resolveUpstream: the only code that talks to subtitlecat — SERVICE WORKER ONLY
      parse.ts           HTML → Release / Track, driven by the selectors — OFFSCREEN DOCUMENT
    searchTitle.ts       guesses a film title from the tab's <title> to seed the search box
    messaging.ts         typed wrappers over chrome.runtime / chrome.tabs messaging
    storage.ts           style/style2/dual + allowlist + language → sync; per-film slots → local
    videoKey.ts          stable per-film id (top page path + title + rounded duration)
    log.ts               console logger, off unless the page flag is set

  background/
    service-worker.ts    message router, per-tab detection hints for the popup
    offscreen.ts         opens/closes the offscreen document and relays parse requests to it

  offscreen/
    offscreen.html       an invisible extension page — exists so the worker has a DOMParser
    offscreen.ts         answers parse:search / parse:detail with JSON

  content/
    content-script.ts    entry: runs in EVERY frame, gates on the allowlist, owns the session
    video-agent.ts       finds the film's <video> in this frame
    overlay.ts           shadow-DOM renderer, rect tracking, fullscreen handling
    panel-host.ts        mounts the React panel — only in the frame that owns the video

  panel/                 React app rendered in-page (Dropzone, StyleControls, SyncTool, CueList, …)
  popup/                 toolbar popup: allow/block the current site, open the panel

public/icons/            generated by `npm run icons`
tools/make-icons.mjs     the generator
remote/config.json       what installs fetch: selectors + donation prompt. See remote/README.md
```

### Where things run

| Context | Files | Notes |
|---|---|---|
| Every frame | `content/content-script.ts`, `lib/sites.ts` | `all_frames: true`, `document_start`; stands down unless the site is allowed |
| The video's frame | `content/overlay.ts`, `content/panel-host.ts`, `panel/*` | whichever frame won detection |
| Service worker |  `background/service-worker.ts`, `background/offscreen.ts`, `lib/api.ts`, `lib/subtitlecat/{http,remote}.ts`, `lib/tvmaze.ts` | the only context that can see the whole tab, and the only one that may `fetch` |
| Offscreen document | `offscreen/*`, `lib/subtitlecat/parse.ts` | opened by the worker when a search needs parsing, closed shortly after; has a DOM, never shown |
| Extension page | `popup/*` | the toolbar popup |

---

## Message passing

Subtitle state does **not** cross a context boundary — the panel and the overlay share a frame
and call each other directly. Neither does the allowlist: every context reads it from
`storage.sync` and reacts to `storage.onChanged`, so switching a site on or off needs no
messaging at all and takes effect without a reload. Only these cross the boundary, and all of
them go through the service worker:

```
content script  --sendToBackground-->  background     video-seen, video-detected, get-top-url
background      --broadcastToTab---->  content script toggle-panel
popup           --askBackground----->  background     tab state, toggle-panel relay
panel           --askBackground----->  background     api:search, api:release, api:download
panel/popup     --askBackground----->  background     donate
background      --sendMessage------->  offscreen      parse:search, parse:detail
```

The `api:` line is not a stylistic choice. **The panel cannot fetch subtitlecat itself:** an
MV3 content script's `fetch` is subject to the *page's* CORS rules, while the service worker's
is governed by our host permissions. `lib/api.ts` therefore runs in the worker only — importing
it from the panel produces code that fails on someone else's site and works on yours. The
`api:` prefix is historical; nothing behind it is an API any more.

The last line is the one this build added. **The worker has no DOM**, so the HTML it fetched
is handed to the offscreen document, which parses it and answers with JSON. Those messages
carry `target: 'offscreen'` — every runtime listener sees every runtime message, and the
offscreen listener must ignore the panel's (and return `false`, so the channel is left to the
worker). The selectors travel inside the message, so the offscreen document never loads the
config itself.

All message shapes live in the `ToBackground` / `ToContent` / `ToBackgroundFromPopup` /
`ToOffscreen` unions in `src/types.ts`.

**To add a message type:** add a variant to the relevant union, then handle it in
`background/service-worker.ts`'s router and in whichever context receives it. Those `switch` statements
have no `default` case on purpose — keep it that way, so an unhandled variant is a type error.

The service worker is suspended after ~30s idle, so **nothing may assume its in-memory state
survives**. What it holds — which tabs turned out to contain a film — is a hint for the popup,
mirrored into `storage.session` and restored on wake.

---

## The site allowlist

`src/lib/sites.ts`. Stored in `storage.sync` under `sites`; the defaults in
`DEFAULT_ALLOWED_SITES` apply until the user changes anything, after which the stored list is
the whole truth. Users edit it from the toolbar popup or the panel's **Sites** tab, both of
which render the same `SitesEditor`.

Two things about it are load-bearing:

- **It is matched against the tab's top-level host, never the frame's.** The film plays inside a
  cross-origin embed iframe on a rotating domain that no user would think to allow — `hdfilme.to`
  is the site, `dr0pstream.com` is an implementation detail of it. A frame gets the top host from
  `location.ancestorOrigins` without any messaging, which matters at `document_start`; the
  service worker is asked only when an ancestor is opaque.
- **The manifest therefore still matches `<all_urls>`.** An allowlist expressed as manifest
  `matches` would exclude the one frame that actually contains the video. The gate has to be at
  runtime.

Matching is by domain suffix, so a rule covers its subdomains. Turning the switch off for a host
removes *every* rule covering it, not just an exact match — otherwise switching `www.example.com`
off would leave an `example.com` rule behind and the switch would flick straight back on.

---

## Subtitle search

The **Find** tab searches subtitlecat **directly, from the service worker**. In `extension/`
the same tab goes through the `web/` API, and the root `CLAUDE.md` gives three reasons for
that: the parsing lives server-side so a markup change is a deploy rather than an extension
update; the rate limiter in front of the API; and the subtitle files being relayed rather than
redirected. This build gives up the server and pays for each of those differently:

**Parsing is client-side, but the selectors are data.** `lib/subtitlecat/parse.ts` is the
server's cheerio parser ported onto the DOM, and every selector it uses is a field of
`RemoteConfig` (`lib/subtitlecat/config.ts`). The worker fetches `remote/config.json` from
this repository on GitHub (`lib/subtitlecat/remote.ts`), caches it in `storage.local` for six
hours, and falls back to the bundled `DEFAULT_CONFIG` when it cannot. So when subtitlecat
renames a class, the fix is an edit to that JSON file and a push — see `remote/README.md`.
A redesigned page is still a new build; the config covers the common case, not every case.

Three things about the config are deliberate:

- **Every field falls back on its own.** `readConfig` never throws; a malformed value
  degrades to the bundled one. A selector that does not *parse* cannot be caught there
  (there is no DOM in the worker), so the offscreen document reports it and `lib/api.ts`
  retries the parse with the bundled selectors. A typo in the remote file costs one extra
  parse per page, not every search until it is fixed.
- **`base` must be an `https` origin, `searchPath` must start with `/` and carry
  `{query}`.** The config is trusted exactly as much as the repository is — it can also
  change where donations go — but a plain `http` base or an absolute search URL is never
  a legitimate edit and is refused.
- **`remote.test.ts` asserts the remote file matches `DEFAULT_CONFIG`.** They should agree
  at the moment a build is cut; a fresh install should not behave differently from an
  established one for its first six hours. React to a site change by editing the remote
  file first, then bring the default up to match before the next build.

**No rate limiter, because there is nothing to protect.** The server's limiter existed so
the API could not be used as someone's free scraping backend. With no server, each user
reaches subtitlecat from their own address, exactly as their browser would, and the site's
own limits apply to them alone. A subtitlecat `429` comes back as `code: 'rate_limited'`,
which `Refusal` in `FindTab` renders amber rather than red — waiting is not the same as
broken. The install id and its `X-Subtitler-Install` header are gone with the limiter; this
build sends nothing that identifies the installation to anyone.

**Fetches obey the same rules the server's did.** `lib/subtitlecat/http.ts` is the only
code that talks to the site: a timeout, a 4 MB response cap, and `resolveUpstream`, which
resolves every path against the site's origin and refuses anything that lands elsewhere —
an absolute URL, a protocol-relative `//evil.com`, a `..` climb. Paths come out of parsed
HTML and back from the panel, so that check is the boundary.

**Parsing happens in an offscreen document.** A service worker has no `DOMParser`; the
popup has one but is open for seconds at a time; the content script has one but runs inside
somebody else's page. MV3's answer is `chrome.offscreen`: `background/offscreen.ts` opens
`offscreen/offscreen.html` with the `DOM_PARSER` reason when a parse is needed and closes it
thirty seconds after the last one — long enough to cover the pause between a search page and
its five detail pages, so a search does not pay for the document twice. Chrome allows one
per extension, so creation is serialised and "already exists" is not an error. `DOMParser`
yields an inert document: no script runs, no image loads. Subtitlecat's markup is untrusted
and that is where it is handled. The `offscreen` permission in the manifest is for this.

**Caching, around a worker that gets suspended.** As with TVmaze: nothing lives in worker
memory. Search results and release pages go in `storage.session` (`sc:search:*`,
`sc:detail:*`), six hours and one hour respectively — so flipping the second language or
paging back does not refetch. The config goes in `storage.local`, because it should survive
a browser restart. What is cached is per install; there is no shared cache any more, and a
popular film is fetched once per person rather than once for everyone.

**The shapes did not change.** `lib/api.ts` still exports `searchSubtitles`, `fetchRelease`,
`downloadSubtitle` and `fetchDonatePrompt` returning `ApiResult<T>`, and `lib/api-types.ts`
still describes `Release`, `Track`, `SearchResponse` and `ReleaseResponse` — which is why
`panel/store.ts`, `FindTab` and the popup are the files from `extension/` almost untouched.
What went: `ApiFailure.action` (a server-owned button, for a server that could move it) and
the `server` error code.

**Search is free, like everything else.** There is no licence key, no sign-in and no
credential of any kind.

The manifest pins its own `key` — `extension-isolated/key.pem`, distinct from the other two
builds', which is what lets all three be installed at once. Back it up.

**The donation prompt** (`PanelBanner`, and `DonateLine` in the popup) comes from the same
`remote/config.json`, under `donate`. Its heading, message, colour and links are rendered
**inside somebody else's page** — as text, never markup, with the colour only ever an inline
style value. `lib/donate.ts` is the validating half of `web/lib/donate.ts`, run on this side
now that there is no server side: `http`/`https` URLs only, `#rrggbb` only, every string
collapsed and capped, and a link that fails is dropped rather than rendered dead.

The UI mirrors what the search actually returns: a list of *releases* (someone's upload, named
after the video file it was timed against), each holding one subtitle per language. Picking by
filename is not cosmetic — a track timed against the same rip needs no syncing at all, which is
why the release name is the most prominent thing in the row and the language is secondary.

The search box is *seeded* from the tab's title via `guessSearchTitle`, never searched
automatically: the guess is often right and sometimes comically wrong, and the user is looking
straight at an editable input either way.

**Search is free, like everything else.** There is no licence key, no sign-in and no
credential of any kind — `background/auth.ts`, `popup/LicenseBox.tsx` and
`panel/components/AccountLine.tsx` are gone, along with the `auth:*` messages.

**What survived is `X-Subtitler-Install`**, and its job changed. It used to be what the
server counted devices by; it is now what the server's *rate limiter* counts against, and
that limiter is the only thing standing in front of the search API. So:

- It is attached in `lib/api.ts`, in **both** fetch call sites. Missing the hand-rolled one
  inside `downloadSubtitle` is the easy mistake and has been made before.
- It lives in `chrome.storage.local` — **never `sync`**, which would push it to every
  machine on the profile and make several browsers share one rate-limit bucket.
- **It must not be regenerated.** A fresh id per service-worker restart does not evade the
  limiter — an unidentified caller lands in a shared `anonymous` bucket with everyone else
  — it merely scatters the user's own history.
- It is never passed through a message. `background/install.ts` resolves it inside the
  worker, because no caller has any business choosing it.

The manifest still pins a `key`, for a stable Web Store identity. Back up `extension/key.pem`
and upload the same key to the Store.

**The panel never decides on its own that a request will be refused.** It renders whatever
the server returned — `find.code` and `find.action` beside `find.error`. Two sources of
truth drift apart; one does not. The only refusal a well-behaved client can now hit is
`rate_limited`, and `Refusal` in `FindTab` renders it amber rather than red: waiting is not
the same as broken.

**The donation prompt** (`PanelBanner`, and `DonateLine` in the popup) is the one other
thing the extension asks the server for. Its heading, message, colour and links are all
admin-supplied and rendered **inside somebody else's page** — as text, never markup, with
the colour only ever an inline style value the server has validated as `#rrggbb`.

**One language per search, and a second fetched on demand.** The search language lives in
`storage.sync` under `langs` and defaults to `en`; the loader still accepts the array earlier
versions wrote and takes its first entry, so nobody's choice is silently reset. Changing it
re-runs the search rather than clearing it — the query has not changed and the search page
is cached in `storage.session`, so it costs nothing upstream: a release page carries every
language, and the filter runs over data already in hand.

`langs2` holds the **second** track's language, and it is deliberately not part of the
search. See below.

### Loading a pair

**The checkbox lives on the Find tab, not just the File tab.** `dual.enabled` is one field
in the store, and both checkboxes read and write it — checking either flips both — but a
control that only exists on a tab someone has no reason to visit while searching is not
discoverable. `FindTab`'s own toggle is what makes "search two languages" findable from the
one place a person is actually looking for it, and turning it on re-runs an already-finished
search when the two languages differ, so an existing result list does not sit there showing
an empty second column until the next search.

With it on, the search asks for **both languages in one request** — `lang=en,de` — and
results render as **two columns per release**, one per language, rather than a flat list of
tracks:

- Each column shows that release's track in that language, or a plain "Not available" if it
  has none — which is the common case for anything but the most popular releases, and
  reading it off the column is clearer than a row disappearing from a flat list would be.
- Each column's button loads directly into that column's slot. There is no separate
  selector to line up first: column 1 is always slot 0, column 2 is always slot 1.
- The columns only appear when the two languages actually differ (`language2 !== language`)
  — with dual on but both languages equal, the search itself collapses to one language (see
  `searchLangParam` below), and two identical columns would be worse than the plain list.

**Asking for both in one request is the correct shape, not an optimisation.** The worker
fetches a release page once and it already contains every language — `filterByLanguages` is
post-processing, and the detail cache is keyed on the release id rather than the language.
There was briefly a per-release "+ 2nd" button making a second request; widening `lang=`
deleted it and the state behind it.

`searchLangParam` builds the parameter, and sends one code when dual mode is off or when
both languages are the same. `language2` falls back to the primary rather than to English —
proposing a language the user does not read is worse than proposing the one they just
picked — so equal languages are a normal state, and the second picker simply has no effect
until it is changed.

Results are paged, five per page, and every release on a page arrives expanded. That bound is
the point: without it a search for a popular film meant thirty-odd detail fetches against
someone else's site.

---

## The series browser

Picking a show, a season and an episode, so a search for episode four is a click rather
than typing `Person of Interest s01e04` for the fourth time this evening. It sits at the top
of the **Find** tab and its only output is the query in the box below it.

**Data from TVmaze, direct from the service worker.** No API key and a stable contract.
In `extension/` this was the one call that did not go through `web/`; here it is one of
two, and the same reasoning was extended to subtitle search. It has to run in the worker: a
content script's `fetch` obeys the *page's* CSP, so calling it from the panel works on the
harness and fails on a site with a strict `connect-src`.

**One request per show, and not the obvious one.** `/shows/:id/episodes`, grouped by season
— **never `/shows/:id/seasons`**. That endpoint's `episodeOrder` is null for a season still
airing and is the *ordered* count rather than the episodes actually listed, so the shows
somebody is most likely to be watching are exactly the ones it gets wrong. Counting the real
list cannot fail that way and costs one fetch instead of two.

**Next/previous walk the list, they do not add one.** Season one ends at 7 for one show and
23 for another, so `episode + 1` is right until it silently is not — and the failure looks
like a search that found nothing rather than like a bug. Holding the real episode list is
what makes the season boundary correct, and it is also what makes a gap in the numbering
(a withdrawn episode) step over rather than into. There are tests for both.

**Specials are dropped** — season 0, or a null episode number. `s00e01` is not something you
can search a subtitle site for.

**No poster images.** TVmaze serves them from `static.tvmaze.com`, and the panel renders in
a shadow root inside *somebody else's document*; images in a shadow root still obey the host
page's `img-src`, so posters would load on some sites and silently fail on others, which
reads as a bug. Name, year, network and status are enough to tell two shows apart.

**Caching, around a worker that gets suspended.** Nothing may live in worker memory — it
would appear to work in development and miss constantly in real use. Searches go in
`storage.session` (cheap to refetch, gone when the browser closes); episode lists go in
`storage.local` with a seven-day TTL, which is what makes *Next* instant a week later.

**The position advances when a search runs, not when a subtitle loads.** Finding a track
that actually fits often takes two or three attempts on one episode, and a counter running
ahead of the user is worse than one they press once.

`lib/tv.ts` is the pure half — grouping, walking, query formatting, the remembered list —
and holds all the tests. `lib/tvmaze.ts` is fetching and caching, worker-only.
`panel/tvStore.ts` is a **separate zustand store** from `usePanel`: it owns no subtitle
state and touches the panel only to set the query and press Search. That seam is also what
makes the whole feature a clean deletion for the search-free build, which has no query box
to fill in.

**Television only.** TVmaze has no films, and there is no comparable film database that
works without an API key — the Studio Ghibli one is about twenty titles. For a film the
query box is typed into directly, seeded from the page title by `guessSearchTitle`, exactly
as before. If film metadata is ever wanted it means TMDb or OMDb and therefore a key — and
a key cannot ship inside an extension anybody can unzip, so that feature would need a server
again. It is the one thing this build's design rules out.

## Two subtitles at once

Off by default (`DualLayout.enabled`), and the single-track path is unchanged — that is a
requirement, not a nicety, since most sessions are one track.

**Two slots, two timings.** `slots[0]` is the primary, `slots[1]` the secondary, each with
its own `SyncState`. Independent timing is the whole point: two tracks for one film are
almost never cut from the same release, so a shared transform would mean fixing one breaks
the other. Every existing sync tool applies to a slot unchanged, because `lib/sync.ts` is
pure and never knew which track it was working on.

**One overlay host, two blocks inside it.** The shadow root holds a `.stack` containing
`.cues-0` and `.cues-1`. This is the decisive design choice: a second overlay would need
its own copy of the fullscreen re-parenting, the letterbox maths, the `ResizeObserver` and
the rect tracking — every gotcha in this file, solved twice. Inside one host they are solved
once.

Consequences worth knowing:

- **DOM order is always primary-then-secondary.** Which one appears on top is
  `flex-direction` (`column-reverse` for secondary-above), so changing the order never moves
  the primary line.
- **Position belongs to the stack, not to a block.** `bottomPct`, `maxWidthPct`, `anchorTo`
  and `textAlign` are read from the *primary* style only, and the Style tab hides those
  controls when you are editing the secondary. A secondary with its own idea of "bottom"
  would not be a second line; it would be a second overlay.
- **`.cues:empty { display: none }` is load-bearing.** Without it a slot with no active cue
  still holds the stack's `gap` open, and the primary line hops every time the secondary
  happens to be silent.
- **Each slot keeps its own `paintedKey`.** The two tracks change cue at different moments;
  one shared key would repaint both on most frames.
- Slot 1 exists in the DOM whether or not dual mode is on. What stops it drawing is a
  condition in `render()`, so toggling the mode needs no rebuild.

**Storage needed no migration.** Appearance is three `storage.sync` keys — `style`,
`style2`, `dual` — so a `style` written before this feature loads unchanged as the primary
and the other two fall back. Per-film state grew a `slots` pair, and `storage.ts#toSlots`
lifts a legacy `{ track, sync }` into slot 0 with slot 1 empty, which is exactly what the
user had. `MAX_REMEMBERED_MOVIES` dropped 20 → 12, because a film can now hold two tracks
against the same 10 MB quota.

`lib/slots.ts` holds the reducers, deliberately free of React, zustand, `chrome.*` and the
overlay — it is the part worth testing, and the part the search-free build copies verbatim.

**One selector for the whole panel.** `activeSlot` decides which slot File, Find, Sync
*and* Style act on. Four independent toggles would be three extra chances to edit the track
you are not looking at. Read it through `selectSlotId` / `selectTrack` / `selectSync` /
`selectStyle` rather than indexing `slots[activeSlot]` by hand — those fold in the
dual-off case, where the active slot is forced to the primary.

## Subtitle timing model

One transform applies to the whole track:

```
subtitleAppearsAt = cue.start * scale + offset      // defaults: scale = 1, offset = 0
```

- **1-point anchor** — the user clicks the line being spoken right now, at video time `T`:
  `offset = T - cue.start * scale`. Fixes a constant offset.
- **2-point fit** — anchors near the start and near the end:
  `scale = (T₂ - T₁) / (c₂.start - c₁.start)`, then `offset = T₁ - c₁.start * scale`.
  Fixes progressive drift, which is almost always a framerate mismatch: a 25 fps subtitle track
  against a 23.976 fps rip drifts ~4.3 %, i.e. 10+ seconds by the end of a film.

Guards in `lib/sync.ts`: anchors must be ≥ 60 s apart, `scale` is clamped to `[0.9, 1.1]`, and
when the fitted scale lands within 0.3 % of a known ratio in `FPS_RATIOS` the UI offers to snap
to the exact value.

---

## Gotchas

Each of these has cost real debugging time. They are handled in the code; don't regress them.

- **Fullscreen reparenting.** Only descendants of `document.fullscreenElement` render in
  fullscreen. On `fullscreenchange` / `webkitfullscreenchange` the overlay root must be
  re-`appendChild`-ed into the new fullscreen element. This is the #1 way subtitle overlays break.
- **Ads and prerolls fire `play` too.** Detection requires `readyState >= 2` and `duration > 90 s`,
  and picks the largest rendered video when several qualify. If `duration` is `NaN`/`Infinity` at
  play time, wait for `loadedmetadata` and re-evaluate.
- **The `<video>` is re-created on quality switch.** The `MutationObserver` must detach and
  re-attach the overlay rather than holding a stale element reference.
- **"Extension context invalidated."** After reloading the extension, content scripts from the
  previous load remain on the page and throw on every `chrome.*` call. Guard entry points with
  `if (!chrome.runtime?.id) return;` and tear listeners down.
- **Tailwind in shadow DOM.** Import the built CSS with `?inline` and install it on the shadow
  root via `adoptedStyleSheets`. Never let preflight into the host page.
- **Use `requestVideoFrameCallback`, not `timeupdate`.** `timeupdate` fires ~4×/sec, which makes
  subtitles visibly late. The cue loop reads `currentTime` per frame and only touches the DOM when
  the active cue index actually changes.
- **Position against the picture, not the element.** Derive the letterbox bars from
  `videoWidth`/`videoHeight` versus the element's `getBoundingClientRect()`, so text sits inside
  the image rather than floating over a black bar (the `anchorTo` style option switches this).
- **`<all_urls>` is deliberate.** Both the site domain and the embed host rotate, and the embed
  frame is the one that holds the video — so injection has to be broad and the *allowlist* has to
  be the thing that narrows it, at runtime. See the allowlist section above.

- **A disabled site must tear down, not just hide.** Switching a site off destroys the overlay,
  disposes the detector and unmounts the panel; switching it on builds all three fresh. Anything
  that caches an element or a listener across that boundary will keep drawing on a page the user
  has just switched off.

- **Register `chrome.runtime` listeners once, outside the session.** The session is built and torn
  down every time the allowlist changes, and a listener registered inside it leaks one per toggle.

- **Typing over a video needs help.** Players bind space to play/pause, and often do it from a
  `document` listener in the **capture** phase — which runs before the event reaches our input
  and calls `preventDefault()` to stop the page scrolling, cancelling the character insertion
  too. The space then never appears, and which player is underneath decides whether it works.
  `TextInput` in `panel/components/ui.tsx` handles it: every key event stops at the panel, and a
  space that was already cancelled upstream is inserted by hand with the caret restored. Use
  `TextInput` for panel inputs rather than a bare `<input>`.

- **Entry points must not share a basename.** Rollup names each output chunk after its entry's
  basename, so `background/index.ts` and `content/index.ts` both emitted `index.ts-<hash>.js` —
  and the generated `service-worker-loader.js` bound to the *content script*. The worker then ran
  content-script code, threw on `window` (a worker has none) before registering any listener, and
  every `sendMessage` failed with "Receiving end does not exist" from then on. Nothing logs it:
  the extension just stops answering, and subtitlecat is never called. Hence the entries are
  named `service-worker.ts` and `content-script.ts`, and `npm run verify` asserts each loader
  resolves to a chunk built from the entry it names — and that the offscreen page made it into
  `dist/`, since it is opened by URL and nothing else notices when it is missing.

- **Every runtime listener sees every runtime message.** `chrome.runtime.sendMessage` from the
  panel reaches the worker, the popup if it is open, *and* the offscreen document if it is
  open. Chrome answers with whichever listener responds first. The offscreen listener therefore
  checks `target === 'offscreen'` and returns `false` for anything else; a listener that
  answered `undefined` to an `api:search` would race the worker and sometimes win.

---

## Debugging a failure on the live site

There is no debug UI; the site is inspected through its own console.

Logging is off by default — this script runs in every frame of an allowed page, including the
player's iframe, and a running commentary in the site's console is not something to inflict
uninvited. To turn it on for a page:

```js
localStorage['subtitler:debug'] = '1'   // then reload
```

Every frame then reports what it found and why it skipped it: `[subtitler:gate]` for the
allowlist decision, `[subtitler:detect]` for each `<video>` considered and the reason it was
passed over, `[subtitler:overlay]` for attachment. Errors always print, flag or not.

The player's iframe has its own console context — pick it from the frame dropdown in devtools, or
the detection logs will look as though they never happened. Loading the embed URL directly in a
tab isolates player problems from iframe problems.
