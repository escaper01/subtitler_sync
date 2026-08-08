# Subtitler Extension

A Chrome/Edge (Manifest V3) extension that overlays user-supplied `.srt` / `.vtt` subtitles onto
any HTML5 video playing in the browser, with a click-to-sync tool for realigning a mistimed track.

Built for streaming sites that ship no subtitle track of their own — primarily `hdfilme.win`
(which rotates domains: `.win`, `.best`, …).

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

### Scope boundary

This overlays text on video the user is already playing in their own browser. It does not
download, decrypt, deobfuscate, record, or redistribute media, and must not grow features that do.

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
npm run test     # vitest: parser, timing maths, cue lookup
npm run check    # typecheck + tests + build, i.e. everything
```

Tests cover the pure logic — `lib/subtitles/parse.ts`, `lib/sync.ts`, `lib/subtitles/lookup.ts` —
because those are where a subtle error is invisible on screen. The DOM-facing parts (overlay
positioning, detection) are verified through the harness instead.

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

**Shortcuts:** `Alt+Shift+S` toggles the panel, `Alt+Shift+D` opens the debug window. Both are
remappable at `chrome://extensions/shortcuts`. The toolbar icon also toggles the panel.

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
detection bug.

---

## Structure

```
src/
  manifest.config.ts     MV3 manifest, authored as TypeScript
  hosts.ts               known site/embed hosts (documentation + future manifest tightening)
  types.ts               Cue, SyncState, SubtitleStyle, Message union, FrameReport

  lib/
    subtitles/parse.ts   parseSRT / parseVTT / sniffFormat / decode with encoding fallback
    subtitles/lookup.ts  cursor-cached binary search over sorted cues
    sync.ts              applyTransform, onePointAnchor, twoPointFit, FPS_RATIOS
    messaging.ts         typed wrappers over chrome.runtime / chrome.tabs messaging
    storage.ts           style → storage.sync; per-movie sync state → storage.local
    videoKey.ts          stable per-film id (top page path + title + rounded duration)
    log.ts               ring-buffer event logger, exportable as markdown

  background/
    index.ts             message router, frame registry, panel-open decisions
    netlog.ts            observational webRequest ring buffer + token masking

  content/
    index.ts             entry: runs in EVERY frame, wires detection to reporting and the UI
    video-agent.ts       finds the film's <video> in this frame; tracks rejects for diagnostics
    overlay.ts           shadow-DOM renderer, rect tracking, fullscreen handling
    panel-host.ts        mounts the React panel — only in the frame that owns the video

  panel/                 React app rendered in-page (Dropzone, StyleControls, SyncTool, CueList, …)
  debug/                 standalone debug tab: frame tree, request log, event log, Copy report
```

### Where things run

| Context | Files | Notes |
|---|---|---|
| Every frame | `content/index.ts`, `content/video-agent.ts` | `all_frames: true`, `document_start` |
| The video's frame | `content/overlay.ts`, `content/panel-host.ts`, `panel/*` | whichever frame won detection |
| Service worker | `background/*` | the only context that can see all frames of a tab |
| Extension page | `debug/*` | opened as its own tab |

---

## Message passing

Subtitle state does **not** cross a context boundary — the panel and the overlay share a frame
and call each other directly. Only these cross the boundary, and all of them go through the
service worker:

```
content script  --sendToBackground-->  background     frame reports, video-detected, log batches
background      --sendToFrame------->  content script toggle-panel, request-report
debug page      --askBackground----->  background     snapshot requests
```

All message shapes live in the `ToBackground` / `ToContent` / `ToBackgroundFromDebug` unions in
`src/types.ts`.

**To add a message type:** add a variant to the relevant union, then handle it in
`background/index.ts`'s router and in whichever context receives it. Those `switch` statements
have no `default` case on purpose — keep it that way, so an unhandled variant is a type error.

The service worker is suspended after ~30s idle, so **nothing may assume its in-memory state
survives**. The frame registry is a cache that is refreshed on demand (a snapshot request
re-asks every frame to report in), and the diagnostic buffers are mirrored into
`storage.session`.

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
- **`<all_urls>` is deliberate.** Both the site domain and the embed host rotate, so neither can be
  hardcoded. `src/hosts.ts` documents the known ones and is where an allowlist would go if this
  were ever submitted to the Web Store; for unpacked personal use the broad match is fine.

---

## Debugging a failure on the live site

The debug tab exists because the site can't always be inspected interactively.

1. Open the debug tab (button in the panel, or the extension's action).
2. **Frame tree** — shows every frame in the tab, whether the content script injected, how many
   `<video>` elements it found, and each one's `readyState` / `duration` / `currentTime` /
   dimensions. This is what diagnoses detection failures.
3. **Request log** — observational `webRequest` ring buffer (500 entries), filterable to media
   requests. Signed-URL tokens (`t=`, `s=`, `e=`) are **masked by default**; they're credentials
   and shouldn't end up in a pasted log.
4. **Copy report** — produces one markdown block with version, page URL, frame tree, recent
   events, recent media requests, and current sync/style state. That block is the thing to paste
   when reporting a problem.
