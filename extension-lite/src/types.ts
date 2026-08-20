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

/* ---------------------------------------------------------------------- slots */

/**
 * Which of the two subtitle tracks something refers to. `0` is the primary.
 *
 * Two, not N. Two is what a person can read at once, and a fixed pair keeps the layout a
 * stack rather than a layout engine, and the state a tuple rather than a list with an
 * empty case.
 */
export type SlotId = 0 | 1;

/**
 * One of the two tracks, with its own timing.
 *
 * **The sync state is per slot and that is the point.** Two tracks for the same film are
 * almost never timed against the same release, so a shared transform would mean fixing one
 * breaks the other. Every existing sync tool — the one-point anchor, the two-point drift
 * fit, the FPS snap — applies to a slot unchanged, because `lib/sync.ts` is pure and knows
 * nothing about which track it is working on.
 */
export interface TrackSlot {
  track: SubtitleTrack | null;
  sync: SyncState;
  /** Per-slot hide, independent of the panel's global "hide subtitles". */
  visible: boolean;
}

/** Where the two blocks sit relative to each other. */
export interface DualLayout {
  /** Off by default: the single-track case must cost nothing. */
  enabled: boolean;
  /** Vertical gap between the blocks, as a percentage of overlay height. */
  gapPct: number;
  /**
   * Which block sits above the other. Primary at the bottom by default, so it keeps the
   * position a single track would have had and does not move when the secondary appears.
   */
  order: 'secondary-above' | 'secondary-below';
}

export const DEFAULT_DUAL_LAYOUT: DualLayout = {
  enabled: false,
  gapPct: 1.2,
  order: 'secondary-above',
};

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
export const PANEL_TABS = ['subtitles', 'sync', 'style', 'sites'] as const;

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
  /** The tab's title, shown in the panel header. */
  | { kind: 'get-page-title' }
  /**
   * The admin-controlled donation prompt, or nothing.
   *
   * **The only message in this union that reaches the network**, and the only request this
   * build makes at all. The full build has `api:*` for subtitle search and `tv:*` for the
   * series browser beside it; neither exists here.
   *
   * Relayed through the worker rather than fetched from the panel: a content script's
   * `fetch` obeys the page's CORS rules, the worker's obeys our host permissions.
   */
  | { kind: 'donate' };

/** background → content script */
export type ToContent = { kind: 'toggle-panel' };

/** popup → background */
export type ToBackgroundFromPopup =
  | { kind: 'popup:get-tab-state'; tabId: number }
  | { kind: 'popup:toggle-panel'; tabId: number };

export type AnyMessage = ToBackground | ToContent | ToBackgroundFromPopup;
