# Subtitler Extension

A Chrome/Edge (Manifest V3) extension that overlays user-supplied `.srt` / `.vtt` subtitles onto
any HTML5 video playing in the browser, with a click-to-sync tool for realigning a mistimed track.

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
`lib/sites.ts`, `lib/searchTitle.ts` — because those are where a subtle error is invisible on
screen. The DOM-facing parts (overlay positioning, detection) are verified through the harness
instead.

The Find tab needs the API running: `cd ../web && npm run dev`.

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
  types.ts               Cue, SyncState, SubtitleStyle, TabState, the message unions

  lib/
    subtitles/parse.ts   parseSRT / parseVTT / sniffFormat / decode with encoding fallback
    subtitles/lookup.ts  cursor-cached binary search over sorted cues
    sync.ts              applyTransform, onePointAnchor, twoPointFit, FPS_RATIOS
    sites.ts             the allowlist: normalising, matching, storage, top-host resolution
    api.ts               subtitle search client — SERVICE WORKER ONLY, see below
    api-types.ts         copy of web/lib/api-types.ts — keep identical
    languages.ts         copy of web/lib/languages.ts — keep identical
    searchTitle.ts       guesses a film title from the tab's <title> to seed the search box
    messaging.ts         typed wrappers over chrome.runtime / chrome.tabs messaging
    storage.ts           style + allowlist + languages → storage.sync; per-movie → storage.local
    videoKey.ts          stable per-film id (top page path + title + rounded duration)
    log.ts               console logger, off unless the page flag is set

  background/
    service-worker.ts    message router, per-tab detection hints for the popup

  content/
    content-script.ts    entry: runs in EVERY frame, gates on the allowlist, owns the session
    video-agent.ts       finds the film's <video> in this frame
    overlay.ts           shadow-DOM renderer, rect tracking, fullscreen handling
    panel-host.ts        mounts the React panel — only in the frame that owns the video

  panel/                 React app rendered in-page (Dropzone, StyleControls, SyncTool, CueList, …)
  popup/                 toolbar popup: allow/block the current site, open the panel

public/icons/            generated by `npm run icons`
tools/make-icons.mjs     the generator
```

### Where things run

| Context | Files | Notes |
|---|---|---|
| Every frame | `content/content-script.ts`, `lib/sites.ts` | `all_frames: true`, `document_start`; stands down unless the site is allowed |
| The video's frame | `content/overlay.ts`, `content/panel-host.ts`, `panel/*` | whichever frame won detection |
| Service worker |  `background/service-worker.ts` | the only context that can see the whole tab |
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
```

That last line is not a stylistic choice. **The panel cannot call the API itself:** an MV3
content script's `fetch` is subject to the *page's* CORS rules, while the service worker's is
governed by our host permissions. `lib/api.ts` therefore runs in the worker only — importing it
from the panel produces code that fails on someone else's site and works on yours.

All message shapes live in the `ToBackground` / `ToContent` / `ToBackgroundFromPopup` unions in
`src/types.ts`.

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

The **Find** tab searches subtitlecat through the `web/` API rather than the site directly — see
the root `CLAUDE.md` for why. The API base is `http://localhost:3000` by default, since nothing
is deployed yet; override it without a rebuild:

```js
chrome.storage.sync.set({ apiBase: 'https://subtitler.example.com' })
```

The UI mirrors what the search actually returns: a list of *releases* (someone's upload, named
after the video file it was timed against), each holding one subtitle per language. Picking by
filename is not cosmetic — a track timed against the same rip needs no syncing at all, which is
why the release name is the most prominent thing in the row and the language is secondary.

The search box is *seeded* from the tab's title via `guessSearchTitle`, never searched
automatically: the guess is often right and sometimes comically wrong, and the user is looking
straight at an editable input either way.

**Search is a paid feature; loading your own file is not, and never will be.** `SubtitlesTab`
touches none of the auth code — that is the promise the product rests on.

**The licence key is the whole credential.** There is no sign-in: the user buys from Lemon
Squeezy, which emails them a key, and they paste it into the toolbar popup (`LicenseBox`).
The key cannot be entered in the panel — that is a content script inside somebody else's
document, under their CSP, and a credential has no business being typed there. The popup is
a real extension page, which is why it owns this.

The key lives in `chrome.storage.local` — **never `sync`**, which would push a bearer
credential to Google's servers and every machine on the profile. `lib/api.ts` attaches it as
`X-Subtitler-Key` in **both** of its fetch call sites; missing the hand-rolled one inside
`downloadSubtitle` is the easy mistake.

Alongside it goes `X-Subtitler-Install`, a random per-install id generated once on first use
and kept in `storage.local` beside the key. It is what the server's device limit counts, so
it identifies the *installation*, not the person — and it must not be regenerated, or every
service-worker restart would spend another of the user's two devices.

The manifest still pins a `key`, but only for a stable Web Store identity now; the
`externally_connectable` handoff it used to exist for is gone. Back up `extension/key.pem`
and upload the same key to the Store.

**The panel never decides on its own that someone is locked out.** It renders whatever the
server returned — `find.code` and `find.action` beside the existing `find.error`. Two sources
of truth drift apart; one does not.

**One language, not several.** It lives in `storage.sync` under `langs` and defaults to `en`; the
loader still accepts the array earlier versions wrote and takes its first entry, so nobody's
choice is silently reset. The API takes exactly one language and rejects codes it does not
offer. Changing the language re-runs the search rather than clearing it — the query has not
changed and the search itself is cached upstream, so it costs only the detail fetches.

Results are paged, five per page, and every release on a page arrives expanded. That bound is
the point: without it a search for a popular film meant thirty-odd detail fetches against
someone else's server.

---

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
  the extension just stops answering, and the API is never called. Hence the entries are named
  `service-worker.ts` and `content-script.ts`, and `npm run verify` asserts each loader resolves
  to a chunk built from the entry it names.

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
