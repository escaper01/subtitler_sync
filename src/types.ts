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

/* ------------------------------------------------------------------ diagnostics */

/** A single `<video>` as seen by the content script, for the debug frame tree. */
export interface VideoReport {
  /** Stable per-frame id we assign, so a video can be referred to across messages. */
  id: string;
  /** Truncated and scheme-tagged; a blob: URL is meaningless outside its frame anyway. */
  src: string;
  readyState: number;
  duration: number;
  currentTime: number;
  paused: boolean;
  muted: boolean;
  videoWidth: number;
  videoHeight: number;
  rect: { x: number; y: number; w: number; h: number };
  /** Whether this is the video the extension attached its overlay to. */
  active: boolean;
  /** If rejected by the detection heuristics, why. */
  rejectedReason?: string;
}

/** One frame's self-report, sent to the background for the debug frame tree. */
export interface FrameReport {
  frameId: number;
  parentFrameId: number;
  url: string;
  origin: string;
  isTop: boolean;
  /** True when this frame hosts the panel UI. */
  hasPanel: boolean;
  videos: VideoReport[];
  updatedAt: number;
}

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEvent {
  t: number;
  level: LogLevel;
  /** Subsystem, e.g. 'detect', 'overlay', 'sync', 'panel', 'bg'. */
  scope: string;
  message: string;
  data?: unknown;
  frameId?: number;
}

export interface NetEntry {
  id: string;
  t: number;
  method: string;
  /** chrome.webRequest ResourceType, e.g. 'xmlhttprequest', 'media'. */
  type: string;
  url: string;
  frameId: number;
  tabId: number;
  status?: number;
  error?: string;
  /** True when the URL looks like streaming media (m3u8/ts/mp4/mpd/key). */
  media: boolean;
}

/* -------------------------------------------------------------------- messages */

/** content script → background */
export type ToBackground =
  | { kind: 'frame-report'; report: Omit<FrameReport, 'frameId' | 'parentFrameId'> }
  | { kind: 'video-detected'; video: VideoReport }
  | { kind: 'log'; events: LogEvent[] }
  | { kind: 'open-debug' };

/** background → content script */
export type ToContent =
  | { kind: 'toggle-panel' }
  | { kind: 'request-report' };

/** debug page → background */
export type ToBackgroundFromDebug =
  | { kind: 'debug:get-snapshot'; tabId?: number }
  | { kind: 'debug:clear' }
  | { kind: 'debug:list-tabs' };

export interface DebugSnapshot {
  version: string;
  generatedAt: number;
  tabId: number | null;
  tabUrl: string | null;
  frames: FrameReport[];
  /** Frames known to Chrome but which never checked in (script failed to inject). */
  silentFrames: { frameId: number; parentFrameId: number; url: string }[];
  events: LogEvent[];
  net: NetEntry[];
}

export type AnyMessage = ToBackground | ToContent | ToBackgroundFromDebug;
