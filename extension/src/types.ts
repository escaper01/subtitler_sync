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
   * The panel cannot call the API itself: a content script's `fetch` obeys the page's
   * CORS rules, the worker's obeys our host permissions. See lib/api.ts.
   */
  | { kind: 'api:search'; query: string; lang: string; page: number }
  | { kind: 'api:release'; path: string; lang: string }
  | { kind: 'api:download'; path: string }
  /**
   * The licence key: what state it is in, and setting or clearing it.
   *
   * `auth:set-key` is sent by the popup, which is the only surface that takes the key —
   * the panel runs inside somebody else's page and should never hold one.
   */
  | { kind: 'auth:state' }
  | { kind: 'auth:set-key'; key: string }
  | { kind: 'auth:clear' }
  /** The admin-controlled upgrade prompt, or nothing. */
  | { kind: 'announcement' };

/** background → content script */
export type ToContent = { kind: 'toggle-panel' };

/** popup → background */
export type ToBackgroundFromPopup =
  | { kind: 'popup:get-tab-state'; tabId: number }
  | { kind: 'popup:toggle-panel'; tabId: number };

export type AnyMessage = ToBackground | ToContent | ToBackgroundFromPopup;
