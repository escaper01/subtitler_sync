# Subtitler Extension — the Store build

The Chrome Web Store listing. Same overlay, same click-to-sync tool, same dual subtitles,
same site allowlist as `extension/` — **without subtitle search**.

**Read [`../extension/CLAUDE.md`](../extension/CLAUDE.md) first.** Everything about the
architecture is there and is not repeated here: why the video is unreachable by URL, why the
overlay and panel render in the video's own frame, why the manifest matches `<all_urls>` and
gates at runtime, the timing model, the dual-subtitle stack, and every entry in the Gotchas
list. All of it applies here unchanged, because most of these files *are* those files.

This document covers only what is different.

---

## Why this folder exists

The full build searches a public subtitle site through our own API. That is the part that
draws Web Store review attention, so it is not in the listing. This build loads a subtitle
file the user already has and fixes its timing, and that is the whole of it.

The full build is downloaded from the website and loaded unpacked. This one is published.

## What is not here

| Gone | Why |
|---|---|
| `lib/api.ts` — all but one endpoint | There is no search to call |
| `lib/languages.ts`, `lib/searchTitle.ts` | Only search needed a language or a guessed title |
| `lib/tv.ts`, `lib/tvmaze.ts`, `panel/tvStore.ts` | The series browser exists to compose a *search query* |
| `panel/components/FindTab.tsx`, `LanguagePicker.tsx`, `SeriesBrowser.tsx` | ditto |
| `lib/searchStorage.ts` | The search language and the remembered series |
| The `api:*` and `tv:*` messages | Nothing sends them |

Four tabs, not five: **File · Sync · Style · Sites**.

## What is still here, and is worth knowing

**It still talks to the server, once.** `GET /api/donate`, for the donation prompt in the
panel and the popup. That is the only request this build ever makes — everything else
happens entirely in the browser. Worth remembering when writing the Store listing and the
privacy policy: "no network access" would be false.

`X-Subtitler-Install` still goes with it. Nothing here is rate limited, but sending one
consistent shape of request from both builds is cheaper than remembering to add it the day
a second endpoint appears.

**Dual subtitles are here on purpose.** They touch no search code, no server and no
credential, and they are the strongest thing the listing can claim — two languages at once
is the reason a language learner installs this at all.

**A different signing key, and it has to be.** Two extensions signed with the same key get
the same id and Chrome refuses to load the second, which would make it impossible to run
both side by side. `key.pem` here is not the one in `extension/`. Back both up; the Store
listing must be signed with this one.

- this build: `amfmeepehkpjlcadlkkcbdclfbofebao`
- the full build: `gpifnmbipbmkkmpnbcmdlehjbpoheidj`

## The shared files, and the one rule

Most of this folder is a **byte-for-byte copy** of `extension/`, kept in step by
`tools/sync-shared.mjs` in the repo root.

```bash
npm run sync          # copy extension/ -> here
npm run sync:check    # fail if anything drifted (also runs inside npm run check)
```

**Fix it in `extension/`, run the sync, commit both.** Never edit a shared file here — the
next sync silently overwrites it. `npm run check` fails on drift in *both* folders, so a
forgotten sync breaks the build rather than shipping a bug that was already fixed once.

The files that are *supposed* to differ are listed in `tools/sync-shared.mjs`, next to the
shared list, so a difference is a decision rather than an oversight:

```
src/types.ts            no search or series messages, four panel tabs
src/lib/api-types.ts    only the donate shapes
src/lib/api.ts          one endpoint
src/panel/store.ts      no FindState, no search actions
src/panel/App.tsx       four tabs
src/manifest.config.ts  different name, description and key
package.json            different name and description
```

`src/lib/storage.ts` is shared, and stays shareable because the panel-tab list lives in
`types.ts` — which already diverges. If you find yourself wanting to make a shared file
build-specific, move the difference into a file that already differs instead.

## Commands

Identical to `extension/`, plus the two sync scripts above. `npm run check` is
typecheck + tests + build + verify + drift check.

There is no Find tab, so nothing here needs `web/` running to develop against — except the
donation prompt, which renders nothing when the server is unreachable.
