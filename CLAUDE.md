# Subtitler

A Chrome / Edge / Brave / Firefox (Manifest V3) extension, and the whole product: subtitle
overlay, sync tool, subtitle search and the TVmaze series browser. **No server.** This repository
*is* the extension; there is no workspace tooling and no second project.

Setup, install and export steps are in [`README.md`](./README.md) (screenshots in `docs/`).
This file is the only `CLAUDE.md`; it documents constraints that are not guessable from the code,
so read it before touching `src/`.

## Status

Working: the overlay, the sync tool (seek bar and player controls, click-a-line sync, offset
nudging, two-point drift fix), a single subtitle track with its own timing, the site allowlist,
subtitle search with one-click loading and a daily source-status dot, the TVmaze series browser,
a compact panel (one top bar, toasts instead of banners), the donation prompt (off by default), a
Firefox build (desktop and Nightly on Android) alongside the Chrome / Edge / Brave one, and
GitHub releases built by `npm run package`.

There is no money in this codebase — no licence keys, accounts or paywall, and the extension
carries no credential. Monetisation is donation links only.

The extension makes requests to exactly two hosts, all from the service worker:
`subtitlecat.com` and `api.tvmaze.com`. Nothing is fetched from anywhere else, and nothing
identifying the installation is sent. If it is distributed, the privacy policy has to describe
that. (The manifest's `host_permissions` is still `<all_urls>`, which is broader than what the
code uses; narrowing it to those two hosts is a possible follow-up.)

Earlier builds — `extension/` (searched through a Next.js API) and `extension-lite/` (no search),
plus the `web/` app that served the first — and the old planning documents were removed; they are in
git history. Their signing keys are not in the repository.

---

## The extension

A Chrome/Edge/Brave/Firefox (Manifest V3) extension that overlays user-supplied `.srt` / `.vtt` subtitles onto
any HTML5 video playing in the browser, with a click-to-sync tool for realigning a mistimed track.

**It needs no server.** Subtitle search talks to subtitlecat directly from the service worker
(and the TVmaze series browser talks to `api.tvmaze.com`) — no container, no database, nothing
to deploy, nothing of ours to keep running. Install it and search works. What that costs, and
how the cost is paid, is the *Subtitle search* section below.

Built for streaming sites that ship no subtitle track of their own — `hdfilme.to`,
`serienstream.to`, `aniworld.to` and friends, which rotate domains freely (`.win` → `.best` →
`.to`, …). It runs only on the sites in the user's allowlist; a rotated domain is added from the
toolbar popup.

---

### Firefox

`npm run build:firefox` (Vite `--mode firefox`) writes `dist-firefox/`; `npm run check` builds
and verifies both. Firefox 140+ on desktop, 142+ on Android (the `gecko` / `gecko_android`
minimums in the manifest, driven by `data_collection_permissions`). Load it from `about:debugging` → *This Firefox* → *Load Temporary Add-on* →
pick `dist-firefox/manifest.json`. It is the same source — the differences are all in
`manifest.config.ts`, `vite.config.ts` and `background/offscreen.ts`:

- **Event page, not a service worker.** Firefox has no MV3 service workers, so the manifest
  declares `background.scripts`. Same file, same listeners, same "nothing survives a
  suspend" rule.
- **No offscreen document.** An event page has a DOM, so `parseOffscreen` parses in place
  when `DOMParser` exists. It tests the capability, not the build flag; the offscreen page
  and permission are simply not part of the Firefox build.
- **Identity is `browser_specific_settings.gecko.id`**, not the Chrome `key`. Changing it
  makes Firefox treat the extension as a different one, so settle it before publishing.
- **`location.ancestorOrigins` does not exist in Firefox**, so `topHostname()` returns null
  for every child frame and the content script takes its existing fallback (`get-top-url`
  to the background). Correct, but one message per frame at startup instead of none.
- **Not tested on a real Firefox from CI** — only built and structurally verified. Run the
  harness (`npm run dev:firefox`, `test/local.html`) in Firefox before shipping.

#### Installing unsigned builds (desktop and Nightly on Android)

`npm run package:firefox` writes `release/subtitler-firefox-<v>.xpi`. Release Firefox only runs
add-ons signed by Mozilla; Developer Edition, Nightly and ESR can run unsigned ones. Android is
Nightly-only for this: copy the `.xpi` over, set the flag below, tap the logo five times in
*Settings > About Firefox Nightly*, then *Install extension from file*. The README has the
step-by-step.

To install `.xpi` files that haven't been signed by Mozilla:

1. Open `about:config` in Firefox
2. Search for `xpinstall.signatures.required`
3. Set it to `false`

Then you can install unsigned `.xpi` files normally. For permanent distribution, submit to
[Mozilla Add-ons](https://addons.mozilla.org) for signing.

---

### The one thing to understand before touching this code

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
  cross-origin child frame. Hence: inject into all frames and render both the overlay and the
  panel in the frame that owns the video (see invariant 2).

The iframe chain, for orientation:

```
hdfilme.to  →  <iframe id="_player" src="//dropload.co/embed-<id>.html">
            →  dr0pstream.com/embed-<id>.html  →  <video src="blob:…">
```

The same `<id>` appears in both URLs, so `dropload.co` almost certainly redirects to
`dr0pstream.com` — one iframe that navigates, rather than two nested ones. Either way
`all_frames: true` covers it, and the outer iframe carries `allowfullscreen`, so fullscreen
propagates to the frame that owns the video, and therefore to our overlay.

#### Invariants

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

#### Scope boundary

This overlays text on video the user is already playing in their own browser, and fetches
*subtitle text files* from a public subtitle site at the user's request. It does not download,
decrypt, deobfuscate, record, or redistribute **media**, and must not grow features that do.
Subtitles are text the user asked for by name; the video is not, and is not touched.

---

### Stack

| | |
|---|---|
| Platform | Chrome / Edge / Brave, Manifest V3 — and Firefox 140+ (Android Nightly 142+), see *Firefox* below |
| Language | TypeScript (strict) |
| Build | Vite + `@crxjs/vite-plugin` v2 |
| UI | React 19 + Tailwind 4, mounted into shadow DOM |
| State | `zustand` (panel only) |

No other runtime dependencies. The cue-list virtualization is hand-rolled (~30 lines) rather than
pulling in `react-window`.

### Commands

```bash
npm install
npm run dev      # Vite watch + HMR for the panel UI
npm run build    # production build into dist/
npm run test     # vitest: parser, timing maths, cue lookup, allowlist matching
npm run check    # typecheck + tests + build + verify, i.e. everything
npm run build:firefox   # Firefox build into dist-firefox/
npm run verify:firefox  # the same loadability check for dist-firefox/
npm run verify   # assert dist/ is loadable — see the entry-basename gotcha
npm run package  # release/subtitler-chrome-<v>.zip + subtitler-firefox-<v>.xpi
npm run icons    # regenerate public/icons/* from tools/make-icons.mjs
npm run key      # generate key.pem (the Chrome extension id); git-ignored, back it up
```

Tests cover the pure logic — `lib/subtitles/parse.ts`, `lib/sync.ts`, `lib/subtitles/lookup.ts`,
`lib/sites.ts`, `lib/searchTitle.ts`, `lib/tv.ts` and `lib/subtitlecat/*` — because those are where a
subtle error is invisible on screen. The DOM-facing parts (overlay positioning, detection) are
verified through the harness instead (`test/local.html` carries a checklist that covers every
tab). The panel components have no automated tests. The subtitlecat parser runs under `happy-dom` in tests
and under the offscreen document's `DOMParser` in the extension; it sees a `Document` either way.

```bash
LIVE=1 npm test  # also parse the real subtitlecat with the bundled selectors
```

The Find tab needs nothing running. `LIVE=1` is the first thing to run when someone reports
that search finds nothing — it says within seconds whether subtitlecat changed their markup.

### Committing

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

### Publishing a release

Bump `version` in `package.json` (the manifest reads it), run `npm run check`, then:

```bash
npm run package        # writes release/subtitler-chrome-<v>.zip and subtitler-firefox-<v>.xpi
gh release create v<v> release/subtitler-chrome-<v>.zip release/subtitler-firefox-<v>.xpi --title "v<v>" --notes "What changed"
```

`release/` is git-ignored. The same files can be dragged onto the release page instead of using
`gh`. The Firefox `.xpi` is unsigned; users of release Firefox need Mozilla to sign it (see
README, *Export the extension*).

### Keyboard shortcuts

Active only while the panel is open and focus is not in a text box (`useHotkeys` in
`panel/App.tsx`): `S` sync to the line being spoken, `G` / `H` nudge 0.1 s earlier / later,
`Shift+S` collapse the panel. `Alt+Shift+S` (manifest command `toggle-panel`, remappable at
`chrome://extensions/shortcuts`) shows or hides it from anywhere.

---

### Structure

```
src/
  manifest.config.ts     MV3 manifest, authored as TypeScript
  types.ts               Cue, SyncState, SubtitleStyle, the message unions

  lib/
    subtitles/parse.ts   parseSRT / parseVTT / sniffFormat / decode with encoding fallback
    subtitles/lookup.ts  cursor-cached binary search over sorted cues
    sync.ts              applyTransform, onePointAnchor, twoPointFit, FPS_RATIOS
    tv.ts                seasons, episodes, next/previous, query formatting — pure
    tvmaze.ts            the TVmaze client and its caches — SERVICE WORKER ONLY
    style.ts             DEFAULT_STYLE, the clamps, and the stack + per-block CSS
    sites.ts             the allowlist: normalising, matching, storage, top-host resolution
    api.ts               subtitle search, downloads, source-status probe — SERVICE WORKER ONLY
    api-types.ts         the shapes the panel consumes
    languages.ts         the subtitle languages offered in search
    donate.ts            validators for the donation prompt — pure, see below
    subtitlecat/
      config.ts          SiteConfig, SITE_CONFIG (selectors, site, donate) — pure, bundled
      http.ts            fetchText, resolveUpstream: the only code that talks to subtitlecat — SERVICE WORKER ONLY
      parse.ts           HTML → Release / Track, driven by the selectors — OFFSCREEN DOCUMENT
    searchTitle.ts       guesses a film title from the tab's <title> to seed the search box
    searchStorage.ts     the remembered search language (storage.sync)
    messaging.ts         typed wrappers over chrome.runtime / chrome.tabs messaging
    storage.ts           style + allowlist + language → sync; per-film track and timing → local
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

  panel/
    App.tsx              the shell: top bar (drag handle, tabs, clock, collapse), Toast, hotkeys
    store.ts             usePanel (zustand): track, sync, style, find state, notices, Sync sections
    tvStore.ts           useTv: the series browser, a separate store on purpose
    components/          SubtitlesTab (File), FindTab, SyncTab, StyleTab, SitesTab, SeriesBrowser,
                         SitesEditor, LanguagePicker, PanelBanner, ui.tsx (shared primitives)
  popup/                 toolbar popup: allow/block the current site, open the panel

public/icons/            generated by `npm run icons`
tools/                   make-icons, make-key, verify-build (run by `npm run check`)
test/                    offline harness: local.html (with a checklist), frame.html, sample .srt files
docs/screenshots/        the README's images
release/                 `npm run package` output (git-ignored)
```

**Panel size.** The panel is `40%` of the player's width (floor 320 px, never wider than the
player) and a Tailwind `@container`, so the Style tab goes to three columns once the panel is
wide enough. Dragging clamps against the player, so it cannot be stranded off-screen.

**Panel layout, and why it is this thin.** The panel is clipped to the player, so every row
counts. There is one top bar (`CC`, the five tabs, the clock, collapse) and no footer; the bar's
empty space is the drag handle, and pointer-down ignores anything inside a `<button>` so the
tabs stay clickable. Errors and notices are **toasts**: `error` / `notice` / `noticeAction` in
`usePanel`, rendered by `Toast` in `App.tsx`, absolutely positioned over the bottom of the panel
so they cost no layout height, and auto-dismissed (about 3 s for a notice, 6 s for an error, 8 s
when it carries an action such as *Snap to 25 fps*). Set `notice` through the store; do not add
inline banners. Search errors inside the Find tab stay inline, next to the button that caused
them.

**The Sync tab.** A seek bar across the full width, play/pause and skip buttons (SVG icons, never
emoji) with a skip-length box (`seekStep`, default 1 s), and chips that show or hide three
sections: Timing (off by default), Lines and Drift (on). `syncSections` lives in the store, so
the choice survives a tab switch but not a reload. A hidden section is not rendered at all. The
cue list is virtualised with a **fixed** `ROW_HEIGHT` (24 px, one truncated line per cue, full
text in the tooltip); auto-height rows for two-line cues would break the scroll maths, which is
why they are not used.

#### Where things run

| Context | Files | Notes |
|---|---|---|
| Every frame | `content/content-script.ts`, `lib/sites.ts` | `all_frames: true`, `document_start`; stands down unless the site is allowed |
| The video's frame | `content/overlay.ts`, `content/panel-host.ts`, `panel/*` | whichever frame won detection |
| Service worker |  `background/service-worker.ts`, `background/offscreen.ts`, `lib/api.ts`, `lib/subtitlecat/http.ts`, `lib/tvmaze.ts` | the only context that can see the whole tab, and the only one that may `fetch` |
| Offscreen document | `offscreen/*`, `lib/subtitlecat/parse.ts` | opened by the worker when a search needs parsing, closed shortly after; has a DOM, never shown |
| Extension page | `popup/*` | the toolbar popup |

---

### Message passing

Subtitle state does **not** cross a context boundary — the panel and the overlay share a frame
and call each other directly. Neither does the allowlist: every context reads it from
`storage.sync` and reacts to `storage.onChanged`, so switching a site on or off needs no
messaging at all and takes effect without a reload. Only these cross the boundary, and all of
them go through the service worker:

```
content script  --sendToBackground-->  background     video-seen, video-detected, get-top-url
background      --broadcastToTab---->  content script toggle-panel
popup           --askBackground----->  background     tab state, toggle-panel relay
panel           --askBackground----->  background     api:search, api:release, api:download, api:status
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

`api:status` returns the source-status dot's state (see *Subtitle search*).

The service worker is suspended after ~30s idle, so **nothing may assume its in-memory state
survives**. What it holds — which tabs turned out to contain a film — is a hint for the popup,
mirrored into `storage.session` and restored on wake.

---

### The site allowlist

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

### Subtitle search

The **Find** tab searches subtitlecat **directly, from the service worker**. The retired
first build went through a server API instead, for three reasons: the parsing lived
server-side so a markup change was a deploy rather than an extension update; a rate limiter sat
in front of the API; and the subtitle files were relayed rather than redirected. This build has
no server and pays for each of those differently:

**Parsing is client-side, and the selectors are bundled data.** `lib/subtitlecat/parse.ts` is the
server's cheerio parser ported onto the DOM, and every selector it uses is a field of
`SITE_CONFIG` (`lib/subtitlecat/config.ts`), alongside the site origin and search path.
**Nothing is fetched at run time.** An earlier version of this build downloaded that config from
a public GitHub repository so a renamed class could be fixed without a release; it was removed to
keep the extension talking to as few hosts as possible, and so a fix is now a new build. When
subtitlecat changes its markup: run `LIVE=1 npm test`, fix the selector in `SITE_CONFIG`, run
`npm run check`, release. The origin must stay `https` and `searchPath` must start with `/` and
carry `{query}`; `resolveUpstream` still refuses anything that lands off-site.

**Is the source working?** The Find tab shows a dot — green, red or amber — with
`subtitlecat.com working / not responding / could not be checked`. `getSourceStatus` in
`lib/api.ts` runs a real end-to-end test (a search for a known title, a release page and a
subtitle file that must contain `-->`), at most once every 24 hours, and stores the answer in
`storage.local` under `sc:status`. Opening the tab only *asks* (`api:status`); a stored answer
under a day old is returned as is. Two deliberate details: a `429` gives amber, not red,
because "slow down" is not "broken"; and a probe made while the browser is offline is never
stored, or one flight would paint the dot red for a day.

**No rate limiter, because there is nothing to protect.** The server's limiter existed so
the API could not be used as someone's free scraping backend. With no server, each user
reaches subtitlecat from their own address, exactly as their browser would, and the site's
own limits apply to them alone. A subtitlecat `429` comes back as `code: 'rate_limited'`,
which `Refusal` in `FindTab` renders amber rather than red — waiting is not the same as
broken. The install id and its `X-Subtitler-Install` header are gone with the limiter; this
build sends nothing that identifies the installation to anyone.

**`www.` is not off-site.** subtitlecat answers `subtitlecat.com/subs/…` with a redirect to
`www.subtitlecat.com`. `fetchText` once compared origins exactly, called that an off-site
redirect, and failed every release fetch — which the panel showed as a result stuck on
"Loading…". `sameSite` now ignores a leading `www.`; the scheme must still match and any
other host is still refused, with the host named in the error.

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
`sc:detail:*`), six hours and one hour respectively — so changing the language or paging back
does not refetch. The source-status result goes in `storage.local` (`sc:status`), because a
day-long answer should survive a browser restart. What is cached is per install; there is no shared cache any more, and a
popular film is fetched once per person rather than once for everyone.

**The shapes did not change.** `lib/api.ts` still exports `searchSubtitles`, `fetchRelease`,
`downloadSubtitle` and `fetchDonatePrompt` returning `ApiResult<T>`, and `lib/api-types.ts`
still describes `Release`, `Track`, `SearchResponse` and `ReleaseResponse` — which is why
`panel/store.ts`, `FindTab` and the popup never learned the server was gone. What went:
`ApiFailure.action` (a server-owned button) and the `server` error code.

**Search is free, like everything else.** There is no licence key, no sign-in and no
credential of any kind.

The manifest pins its own `key` — `key.pem` (git-ignored). Back it up.

**The donation prompt** (`PanelBanner`, and `DonateLine` in the popup) comes from the same
`SITE_CONFIG.donate` (off by default). Its heading, message, colour and links are rendered
**inside somebody else's page** — as text, never markup, with the colour only ever an inline
style value. `lib/donate.ts` validates it on this side, since there is no server to do so:
`http`/`https` URLs only, `#rrggbb` only, every string collapsed and capped, and a link that
fails is dropped rather than rendered dead.

**Find tab layout.** Two collapsible sections, *Series* and *Custom search*, then results, then
the status dot. Custom search collapses itself the moment a series episode becomes active (the
series browser is then driving the searches) and reopens when none is. Results are releases with
a **Use** button and *Back / More* paging.

The UI mirrors what the search actually returns: a list of *releases* (someone's upload, named
after the video file it was timed against), each holding one subtitle per language. Picking by
filename is not cosmetic — a track timed against the same rip needs no syncing at all, which is
why the release name is the most prominent thing in the row and the language is secondary.

The search box is *seeded* from the tab's title via `guessSearchTitle`, never searched
automatically: the guess is often right and sometimes comically wrong, and the user is looking
straight at an editable input either way.

**One language per search.** The search language lives in `storage.sync` under `langs` and
defaults to `en`; the loader still accepts the array earlier versions wrote and takes its first
entry, so nobody's choice is silently reset. Changing it re-runs the search rather than
clearing it — the query has not changed and the search page is cached in `storage.session`, so
it costs nothing upstream: a release page carries every language, and the filter runs over
data already in hand.

#### One track

There is one subtitle track. An earlier version of this build could show two at once
(a second language above the first, timed separately); it was removed outright rather than
hidden, so there is no mode, no second slot and no second language to pick. `storage.ts`
still *reads* what that version wrote — a film's `slots[0]` is loaded as its track — so
nobody's saved timing is lost; `style2`, `dual` and `langs2` are never read, and the first two
are cleared from `storage.sync` the next time the style is saved.

Search asks for one language (`lang=en`). `lib/api.ts` still accepts a comma-separated list
and returns tracks in the order asked for; nothing sends more than one.

Results are paged, five per page, and every release on a page arrives expanded. That bound is
the point: without it a search for a popular film meant thirty-odd detail fetches against
someone else's site. A release whose detail fetch fails is shown with a **Retry** button
(`FindState.failed`) — without that state it was indistinguishable from one still loading.

---

### The series browser

Picking a show, a season and an episode, so a search for episode four is a click rather
than typing `Person of Interest s01e04` for the fourth time this evening. It sits at the top
of the **Find** tab and its only output is the query in the box below it.

**Data from TVmaze, direct from the service worker.** No API key and a stable contract.
It is one of two hosts the worker calls, beside subtitlecat. It has to run in the worker: a
content script's `fetch` obeys the *page's* CSP, so calling it from the panel works on the
harness and fails on a site with a strict `connect-src`.

**One request per show, and not the obvious one.** `/shows/:id/episodes`, grouped by season
— **never `/shows/:id/seasons`**. That endpoint's `episodeOrder` is null for a season still
airing and is the *ordered* count rather than the episodes actually listed, so the shows
somebody is most likely to be watching are exactly the ones it gets wrong. Counting the real
list cannot fail that way and costs one fetch instead of two.

**One row, not chips.** Previous, a season select, an episode select and next sit on a single
row (`EpisodeRow` in `SeriesBrowser.tsx`). It replaced a chip per season, a chip per episode and
a separate stepper, which wrapped to several lines on a long season. Choosing an episode or
stepping runs the search.

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
state and touches the panel only to set the query and press Search. That seam keeps the
whole feature a clean deletion if it is ever not wanted.

**Television only.** TVmaze has no films, and there is no comparable film database that
works without an API key — the Studio Ghibli one is about twenty titles. For a film the
query box is typed into directly, seeded from the page title by `guessSearchTitle`, exactly
as before. If film metadata is ever wanted it means TMDb or OMDb and therefore a key — and
a key cannot ship inside an extension anybody can unzip, so that feature would need a server
again. It is the one thing this build's design rules out.

### Subtitle timing model

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
when the fitted scale lands within 0.3 % of a known ratio in `FPS_RATIOS`, `applyDriftFit`
raises a toast with a *Snap to …* button that applies the exact value.

---

### Gotchas

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

  The same hostility goes further than space: some players pull focus back to themselves on
  *every* key press, which made a text box accept one letter and then go dead. Two defences:
  `installEarlyTypingShield` in `panel-host.ts` stops keydown/keypress/keyup for every key
  typed into one of our boxes at the window capture phase (except Enter, Tab and Escape, which
  the panel needs), and `TextInput` takes focus back if it is stolen without a click, Tab or
  Escape. Verified by adding a document-level listener that focuses the `<video>` on each key.

- **Entry points must not share a basename.** Rollup names each output chunk after its entry's
  basename, so `background/index.ts` and `content/index.ts` both emitted `index.ts-<hash>.js` —
  and the generated `service-worker-loader.js` bound to the *content script*. The worker then ran
  content-script code, threw on `window` (a worker has none) before registering any listener, and
  every `sendMessage` failed with "Receiving end does not exist" from then on. Nothing logs it:
  the extension just stops answering, and subtitlecat is never called. Hence the entries are
  named `service-worker.ts` and `content-script.ts`, and `npm run verify` asserts each loader
  resolves to a chunk built from the entry it names — and that the offscreen page made it into
  `dist/`, since it is opened by URL and nothing else notices when it is missing.

- **Toasts must not take layout.** `Toast` is `absolute` inside the panel on purpose; putting
  messages back in the flow pushes every tab down, which is what moving them out fixed.

- **Placeholders match by substring.** "Series name" is a substring of the Custom search
  placeholder "Film or series name", so anything that finds an input by placeholder (tests,
  scripts) must match exactly.

- **Every runtime listener sees every runtime message.** `chrome.runtime.sendMessage` from the
  panel reaches the worker, the popup if it is open, *and* the offscreen document if it is
  open. Chrome answers with whichever listener responds first. The offscreen listener therefore
  checks `target === 'offscreen'` and returns `false` for anything else; a listener that
  answered `undefined` to an `api:search` would race the worker and sometimes win.

---

### Debugging a failure on the live site

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

---
