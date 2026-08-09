import { create } from 'zustand';
import type { Cue, SubtitleStyle, SubtitleTrack, SyncState } from '@/types';
import { IDENTITY_SYNC } from '@/types';
import type { SubtitleOverlay } from '@/content/overlay';
import { parseSubtitleFile, SubtitleParseError } from '@/lib/subtitles/parse';
import { clampStyle, DEFAULT_STYLE } from '@/lib/style';
import {
  DEFAULT_PANEL_PREFS,
  loadMovie,
  loadPanelPrefs,
  loadStyle,
  saveMovie,
  savePanelPrefs,
  saveStyle,
  type PanelPrefs,
} from '@/lib/storage';
import { makeAnchor, nudge as nudgeSync, onePointFit, resetSync, twoPointFit } from '@/lib/sync';
import { videoKey } from '@/lib/videoKey';
import { log } from '@/lib/log';

/** What clicking a line in the cue list does. */
export type ClickMode = 'quick' | 'anchorA' | 'anchorB';

interface Bridge {
  video: HTMLVideoElement;
  overlay: SubtitleOverlay;
}

interface PanelState {
  bridge: Bridge | null;
  ready: boolean;

  track: SubtitleTrack | null;
  sync: SyncState;
  style: SubtitleStyle;
  prefs: PanelPrefs;

  open: boolean;
  subtitlesVisible: boolean;
  clickMode: ClickMode;

  error: string | null;
  notice: string | null;

  /** Sampled playback position, driving the cue-list highlight. */
  time: number;
  duration: number;

  init: (bridge: Bridge) => Promise<void>;
  tick: () => void;

  loadFile: (file: File) => Promise<void>;
  clearTrack: () => void;

  setClickMode: (mode: ClickMode) => void;
  syncToCue: (cue: Cue) => void;
  setAnchor: (slot: 0 | 1, cue: Cue) => void;
  clearAnchors: () => void;
  applyDriftFit: () => void;
  applyScale: (scale: number) => void;
  nudge: (delta: number) => void;
  resetTiming: () => void;

  setStyle: (patch: Partial<SubtitleStyle>) => void;
  replaceStyle: (style: SubtitleStyle) => void;

  setPrefs: (patch: Partial<PanelPrefs>) => void;
  setOpen: (open: boolean) => void;
  toggleOpen: () => void;
  setSubtitlesVisible: (visible: boolean) => void;

  dismiss: () => void;
}

/** Persisting on every slider tick would hammer storage; trailing-edge debounce instead. */
function debounce<A extends unknown[]>(fn: (...args: A) => void, ms: number) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return (...args: A) => {
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      fn(...args);
    }, ms);
  };
}

const persistStyle = debounce((style: SubtitleStyle) => void saveStyle(style), 400);
const persistPrefs = debounce((prefs: PanelPrefs) => void savePanelPrefs(prefs), 400);
const persistMovie = debounce(
  (key: string, sync: SyncState, track: SubtitleTrack | null) =>
    void saveMovie(key, { sync, track, updatedAt: Date.now() }),
  600,
);

export const usePanel = create<PanelState>((set, get) => ({
  bridge: null,
  ready: false,

  track: null,
  sync: IDENTITY_SYNC,
  style: DEFAULT_STYLE,
  prefs: DEFAULT_PANEL_PREFS,

  open: true,
  subtitlesVisible: true,
  clickMode: 'quick',

  error: null,
  notice: null,

  time: 0,
  duration: 0,

  async init(bridge) {
    set({ bridge });

    const [style, prefs, movie] = await Promise.all([
      loadStyle(),
      loadPanelPrefs(),
      loadMovie(videoKey()),
    ]);

    bridge.overlay.setStyle(style);
    if (movie?.track) bridge.overlay.setTrack(movie.track);
    if (movie?.sync) bridge.overlay.setSync(movie.sync);

    set({
      style,
      prefs,
      track: movie?.track ?? null,
      sync: movie?.sync ?? IDENTITY_SYNC,
      ready: true,
      // Auto-open the first time we see a film, but stay out of the way on a rewatch
      // where the subtitles are already loaded and timed.
      open: !movie?.track,
      notice: movie?.track ? `Restored "${movie.track.name}" for this video.` : null,
    });

    if (movie?.track) {
      log.info('panel', 'restored saved subtitles', {
        name: movie.track.name,
        cues: movie.track.cues.length,
      });
    }
  },

  tick() {
    const bridge = get().bridge;
    if (!bridge) return;
    const time = bridge.video.currentTime;
    const duration = Number.isFinite(bridge.video.duration) ? bridge.video.duration : 0;
    if (Math.abs(time - get().time) > 0.05 || duration !== get().duration) set({ time, duration });
  },

  async loadFile(file) {
    set({ error: null, notice: null });
    try {
      const track = await parseSubtitleFile(file);
      get().bridge?.overlay.setTrack(track);

      const notice =
        track.warnings.length > 0
          ? `Loaded ${track.cues.length} lines with ${track.warnings.length} warning(s).`
          : `Loaded ${track.cues.length} lines.`;

      set({ track, notice, prefs: { ...get().prefs, tab: 'sync' } });
      persistMovie(videoKey(), get().sync, track);
      log.info('panel', 'subtitles loaded', {
        name: track.name,
        cues: track.cues.length,
        format: track.format,
        encoding: track.encoding,
        warnings: track.warnings.length,
      });
    } catch (err) {
      const message =
        err instanceof SubtitleParseError
          ? err.message
          : `Could not read "${file.name}". ${err instanceof Error ? err.message : ''}`;
      set({ error: message, track: null });
      log.warn('panel', 'subtitle load failed', message);
    }
  },

  clearTrack() {
    get().bridge?.overlay.setTrack(null);
    set({ track: null, notice: null, error: null });
    persistMovie(videoKey(), get().sync, null);
  },

  setClickMode(mode) {
    set({ clickMode: mode });
  },

  syncToCue(cue) {
    const { bridge, sync, clickMode } = get();
    if (!bridge) return;

    if (clickMode === 'anchorA') {
      get().setAnchor(0, cue);
      return;
    }
    if (clickMode === 'anchorB') {
      get().setAnchor(1, cue);
      return;
    }

    const next = onePointFit(sync, makeAnchor(cue, bridge.video.currentTime));
    bridge.overlay.setSync(next);
    set({
      sync: next,
      error: null,
      notice: `Shifted by ${next.offset >= 0 ? '+' : ''}${next.offset.toFixed(2)}s.`,
    });
    persistMovie(videoKey(), next, get().track);
  },

  setAnchor(slot, cue) {
    const { bridge, sync } = get();
    if (!bridge) return;

    const anchors: SyncState['anchors'] = [...sync.anchors];
    anchors[slot] = makeAnchor(cue, bridge.video.currentTime);

    const next = { ...sync, anchors };
    set({
      sync: next,
      clickMode: 'quick',
      error: null,
      notice: `Anchor ${slot === 0 ? 'A' : 'B'} set.`,
    });
    persistMovie(videoKey(), next, get().track);
  },

  clearAnchors() {
    const next: SyncState = { ...get().sync, anchors: [null, null] };
    set({ sync: next, notice: null, error: null });
    persistMovie(videoKey(), next, get().track);
  },

  applyDriftFit() {
    const { sync, bridge } = get();
    const [a, b] = sync.anchors;
    if (!a || !b || !bridge) {
      set({ error: 'Set both anchors first.' });
      return;
    }

    const result = twoPointFit(a, b);
    if (!result.ok) {
      set({ error: result.error, notice: null });
      return;
    }

    bridge.overlay.setSync(result.sync);
    const drift = result.driftPerHour;
    set({
      sync: result.sync,
      error: null,
      notice: `Rate set to ${(result.scale * 100).toFixed(2)}% — that was ${Math.abs(drift).toFixed(0)}s of drift per hour.`,
    });
    persistMovie(videoKey(), result.sync, get().track);
  },

  applyScale(scale) {
    const { sync, bridge } = get();
    if (!bridge) return;

    // Keep the first anchor pinned so snapping the rate doesn't shift the whole track.
    const anchor = sync.anchors[0];
    const offset = anchor ? anchor.videoTime - anchor.cueStart * scale : sync.offset;

    const next: SyncState = { ...sync, scale, offset };
    bridge.overlay.setSync(next);
    set({ sync: next, notice: `Rate set to ${(scale * 100).toFixed(3)}%.`, error: null });
    persistMovie(videoKey(), next, get().track);
  },

  nudge(delta) {
    const { sync, bridge } = get();
    if (!bridge) return;
    const next = nudgeSync(sync, delta);
    bridge.overlay.setSync(next);
    set({
      sync: next,
      notice: `Offset ${next.offset >= 0 ? '+' : ''}${next.offset.toFixed(2)}s.`,
      error: null,
    });
    persistMovie(videoKey(), next, get().track);
  },

  resetTiming() {
    const next = resetSync();
    get().bridge?.overlay.setSync(next);
    set({ sync: next, notice: 'Timing reset.', error: null });
    persistMovie(videoKey(), next, get().track);
  },

  setStyle(patch) {
    const style = clampStyle({ ...get().style, ...patch });
    get().bridge?.overlay.setStyle(style);
    set({ style });
    persistStyle(style);
  },

  replaceStyle(style) {
    const clamped = clampStyle(style);
    get().bridge?.overlay.setStyle(clamped);
    set({ style: clamped });
    persistStyle(clamped);
  },

  setPrefs(patch) {
    const prefs = { ...get().prefs, ...patch };
    set({ prefs });
    persistPrefs(prefs);
  },

  setOpen(open) {
    set({ open });
  },

  toggleOpen() {
    set({ open: !get().open });
  },

  setSubtitlesVisible(visible) {
    get().bridge?.overlay.setVisible(visible);
    set({ subtitlesVisible: visible });
  },

  dismiss() {
    set({ error: null, notice: null });
  },
}));
