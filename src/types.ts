import type { DetailSelectors, SearchSelectors } from '@/lib/subtitlecat/config';

/**
 * Shared types. See CLAUDE.md for the architecture these describe.
 */

/* ------------------------------------------------------------------ subtitles */

export interface Cue {
  /** Index into the owning track's sorted `cues` array. */
  index: number;
  /** Start time in seconds, exactly as authored in the file (untransformed). */
  start: number;
  /** End time in seconds, untransformed. */
  end: number;
  /** Text lines, markup stripped, ready to render. */
  lines: string[];
}

export type SubtitleFormat = 'srt' | 'vtt';

export interface SubtitleTrack {
  /** Original filename, shown in the panel. */
  name: string;
  format: SubtitleFormat;
  /** Sorted by `start`, ascending. */
  cues: Cue[];
  /** Recoverable problems found while parsing (bad timestamps, empty blocks, ...). */
  warnings: string[];
  /** Text encoding that was used to decode the bytes. */
  encoding: string;
}

/* ----------------------------------------------------------------------- sync */

/**
 * A point the user marked: "cue N is being spoken right now, at video time T".
 */
export interface Anchor {
  cueIndex: number;
  /** The cue's authored start time, captured so the fit survives a track reload. */
  cueStart: number;
  /** `video.currentTime` at the moment the user clicked. */
  videoTime: number;
}

/**
 * The whole-track timing transform: `shownAt = cue.start * scale + offset`.
 */
export interface SyncState {
  scale: number;
  offset: number;
  /** Anchor slots for the 2-point fit. `[start, end]`; either may be null. */
  anchors: [Anchor | null, Anchor | null];
}

export const IDENTITY_SYNC: SyncState = { scale: 1, offset: 0, anchors: [null, null] };

/* ---------------------------------------------------------------------- style */

export type AnchorTo = 'picture' | 'player';
export type TextAlign = 'left' | 'center' | 'right';

export interface SubtitleStyle {
  fontFamily: string;
  /** Percentage of the overlay's height, so text scales with fullscreen. */
  fontSizePct: number;
  fontWeight: number;
  color: string;
  opacity: number;
  outlineWidth: number;
  outlineColor: string;
  shadow: boolean;
  bgColor: string;
  bgAlpha: number;
  bgPadding: number;
  bgRadius: number;
  /** Distance of the text block from the bottom, as a percentage of overlay height. */
  bottomPct: number;
  maxWidthPct: number;
  lineHeight: number;
  textAlign: TextAlign;
  uppercase: boolean;
  letterSpacing: number;
  /** Position against the picture (inside letterbox bars) or the whole player box. */
  anchorTo: AnchorTo;
}

/* ---------------------------------------------------------------------- panel */

/**
 * The panel's tabs, as data.
 *
 * Here rather than in `storage.ts` because **the two builds have different tabs** and
 * `storage.ts` is copied verbatim between them — see `tools/sync-shared.mjs`. This file
 * already diverges, so the difference lives where it is expected to.
 *
 * The runtime array and the type come from one declaration, so a tab cannot be added to
 * one and forgotten in the other.
 */
export const PANEL_TABS = ['subtitles', 'find', 'sync', 'style', 'sites'] as const;

export type PanelTab = (typeof PANEL_TABS)[number];

/* ---------------------------------------------------------------------- tabs */

/**
 * What the background knows about a tab, so the popup can say something useful about the
 * page you are looking at without talking to its frames.
 */
export interface TabState {
  /** A video long enough to be a film exists in some frame of this tab. */
  videoSeen: boolean;
  /** The overlay is attached to it — i.e. the extension is actually running here. */
  videoAttached: boolean;
}

export const EMPTY_TAB_STATE: TabState = { videoSeen: false, videoAttached: false };

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/* -------------------------------------------------------------------- messages */

/** content script → background */
export type ToBackground =
  | { kind: 'video-seen' }
  | { kind: 'video-detected' }
  /** Fallback for a frame whose ancestor chain is opaque; answers with the tab's URL. */
  | { kind: 'get-top-url' }
  /** The tab's title, which the panel seeds the subtitle search box from. */
  | { kind: 'get-page-title' }
  /**
   * Subtitle search, relayed through the worker.
   *
   * The panel cannot fetch subtitlecat itself: a content script's `fetch` obeys the
   * page's CORS rules, the worker's obeys our host permissions. The `api:` prefix is
   * historical — there is no API behind these any more, see lib/api.ts.
   */
  | { kind: 'api:search'; query: string; lang: string; page: number }
  | { kind: 'api:release'; path: string; lang: string }
  | { kind: 'api:download'; path: string }
  /** Whether the subtitle site is working; a stored answer under a day old, else a test. */
  | { kind: 'api:status' }
  /**
   * Browsing a series on TVmaze, to build a search query without typing it.
   *
   * Relayed through the worker for the same reason the subtitle API is: a content
   * script's `fetch` obeys the *page's* CSP, so this would work on the harness and fail
   * on a site with a strict `connect-src`. See lib/tvmaze.ts.
   */
  | { kind: 'tv:search'; query: string }
  | { kind: 'tv:seasons'; showId: number }
  /**
   * The donation prompt from the bundled config, or nothing.
   *
   * There were three `auth:*` variants beside this one, carrying a licence key, and then
   * an install id sent as a header for a server-side rate limiter. Both are gone: this
   * build sends nothing that identifies the installation to anyone.
   */
  | { kind: 'donate' };

/** background → content script */
export type ToContent = { kind: 'toggle-panel' };

/** popup → background */
export type ToBackgroundFromPopup =
  | { kind: 'popup:get-tab-state'; tabId: number }
  | { kind: 'popup:toggle-panel'; tabId: number };

/**
 * background → offscreen document
 *
 * The worker has no DOM, so HTML it fetched is handed to the offscreen document to turn
 * into JSON. `target` is what tells that document a message is for it — every runtime
 * listener sees every runtime message, and it must ignore the panel's. The selectors
 * travel with the HTML so the document never has to load the config itself.
 */
export type ToOffscreen =
  | { target: 'offscreen'; kind: 'parse:search'; html: string; selectors: SearchSelectors }
  | { target: 'offscreen'; kind: 'parse:detail'; html: string; id: string; selectors: DetailSelectors };

export type FromOffscreen<T> = { ok: true; data: T } | { ok: false; error: string };

export type AnyMessage = ToBackground | ToContent | ToBackgroundFromPopup | ToOffscreen;
