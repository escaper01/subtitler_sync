import { create } from 'zustand';
import type { Cue, DualLayout, SlotId, SubtitleStyle, SyncState } from '@/types';
import { DEFAULT_DUAL_LAYOUT, IDENTITY_SYNC } from '@/types';
import type { SubtitleOverlay } from '@/content/overlay';
import type { SubtitleTrack, TrackSlot } from '@/types';
import { parseSubtitleFile, SubtitleParseError } from '@/lib/subtitles/parse';
import { clampStyle, DEFAULT_STYLE, defaultSecondaryStyle } from '@/lib/style';
import type { Slots } from '@/lib/slots';
import { clearSlot, emptySlots, loadIntoSlot, setSlotSync, withSlot } from '@/lib/slots';
import {
  DEFAULT_PANEL_PREFS,
  loadDual,
  loadMovie,
  loadPanelPrefs,
  loadStyles,
  saveDual,
  saveMovie,
  savePanelPrefs,
  saveStyles,
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

export interface PanelState {
  bridge: Bridge | null;
  ready: boolean;

  /**
   * The two subtitle tracks, each with its own timing.
   *
   * `slots[0]` is the primary and is the only one that renders while `dual.enabled` is
   * false — so the single-track case is unchanged, which is most of them.
   */
  slots: Slots;
  /**
   * Which slot the File, Find, Sync and Style tabs act on.
   *
   * One selector for all four rather than one each: "I am working on the second subtitle"
   * is a single thought, and four independent toggles would make it four.
   *
   * Session state, never persisted — you always come back to the primary.
   */
  activeSlot: SlotId;
  styles: [SubtitleStyle, SubtitleStyle];
  dual: DualLayout;
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
  setActiveSlot: (id: SlotId) => void;
  setDual: (patch: Partial<DualLayout>) => void;
  setSlotVisible: (id: SlotId, visible: boolean) => void;


  setClickMode: (mode: ClickMode) => void;
  /** The one place a new timing reaches the overlay, the slots and storage. */
  applySync: (next: SyncState, notice: string | null) => void;
  syncToCue: (cue: Cue) => void;
  setAnchor: (slot: 0 | 1, cue: Cue) => void;
  clearAnchors: () => void;
  applyDriftFit: () => void;
  applyScale: (scale: number) => void;
  nudge: (delta: number) => void;
  resetTiming: () => void;

  setStyle: (patch: Partial<SubtitleStyle>) => void;
  replaceStyle: (style: SubtitleStyle) => void;
  resetSecondaryStyle: () => void;

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

const persistStyles = debounce(
  (styles: [SubtitleStyle, SubtitleStyle]) => void saveStyles(styles),
  400,
);
const persistDual = debounce((layout: DualLayout) => void saveDual(layout), 400);
const persistPrefs = debounce((prefs: PanelPrefs) => void savePanelPrefs(prefs), 400);

/**
 * Both slots are written together.
 *
 * One record per film, not one per slot: they are read together, evicted together, and a
 * half-written pair would restore a primary against somebody else's secondary.
 */
const persistMovie = debounce(
  (key: string, slots: Slots) =>
    void saveMovie(key, {
      slots: [
        { track: slots[0].track, sync: slots[0].sync },
        { track: slots[1].track, sync: slots[1].sync },
      ],
      updatedAt: Date.now(),
    }),
  600,
);

/** Save whatever the slots currently are. Every timing action ends with this. */
function persist(slots: Slots): void {
  persistMovie(videoKey(), slots);
}

/**
 * The slot the panel's controls address.
 *
 * Forced to the primary while dual mode is off, so a stale `activeSlot` left over from a
 * previous session cannot point every control at a track that is not rendering.
 */
function activeId(state: { activeSlot: SlotId; dual: DualLayout }): SlotId {
  return state.dual.enabled ? state.activeSlot : 0;
}

/** The active slot's timing. */
function activeSync(state: { activeSlot: SlotId; dual: DualLayout; slots: Slots }): SyncState {
  return state.slots[activeId(state)].sync;
}

/**
 * Selectors for "whatever the panel is currently pointed at".
 *
 * Exported so no component re-derives it. `activeId` folds in the dual-off case, and a
 * component doing `s.slots[s.activeSlot]` by hand would miss that and render the secondary's
 * state while the primary is the one on screen.
 */
export const selectSlot = (s: PanelState): TrackSlot => s.slots[activeId(s)];
export const selectTrack = (s: PanelState): SubtitleTrack | null => selectSlot(s).track;
export const selectSync = (s: PanelState): SyncState => selectSlot(s).sync;
export const selectStyle = (s: PanelState): SubtitleStyle => s.styles[activeId(s)];
export const selectSlotId = (s: PanelState): SlotId => activeId(s);

export const usePanel = create<PanelState>((set, get) => ({
  bridge: null,
  ready: false,

  slots: emptySlots(),
  activeSlot: 0,
  styles: [DEFAULT_STYLE, defaultSecondaryStyle(DEFAULT_STYLE)],
  dual: DEFAULT_DUAL_LAYOUT,
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

    const [styles, dual, prefs, movie] = await Promise.all([
      loadStyles(),
      loadDual(),
      loadPanelPrefs(),
      loadMovie(videoKey()),
    ]);

    // A saved film restores its track *and* its timing together — the one case where a
    // sync that was not fitted against the track now being loaded is still correct,
    // because it is the same track it was fitted against.
    const slots: Slots = emptySlots();
    for (const id of [0, 1] as const) {
      const saved = movie?.slots[id];
      if (!saved) continue;
      slots[id] = { track: saved.track, sync: saved.sync, visible: true };
    }

    bridge.overlay.setStyles(styles, dual);
    for (const id of [0, 1] as const) {
      bridge.overlay.setTrack(id, slots[id].track);
      bridge.overlay.setSync(id, slots[id].sync);
    }

    const restored = slots.filter((slot) => slot.track !== null).map((slot) => slot.track);

    set({
      styles,
      dual,
      prefs,
      slots,
      ready: true,
      // Auto-open the first time we see a film, but stay out of the way on a rewatch
      // where the subtitles are already loaded and timed.
      open: restored.length === 0,
      notice:
        restored.length === 0
          ? null
          : restored.length === 1
            ? `Restored "${restored[0]?.name}" for this video.`
            : `Restored both subtitle tracks for this video.`,
    });

    if (restored.length > 0) {
      log.info('panel', 'restored saved subtitles', {
        tracks: restored.map((track) => `${track?.name} (${track?.cues.length} cues)`),
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
    const id = activeId(get());
    set({ error: null, notice: null });
    try {
      const track = await parseSubtitleFile(file);
      get().bridge?.overlay.setTrack(id, track);
      // A fresh file starts from identity — an offset fitted against a different file is
      // not a head start, it is a wrong answer that looks deliberate.
      get().bridge?.overlay.setSync(id, IDENTITY_SYNC);

      const where = get().dual.enabled ? ` as the ${id === 0 ? 'primary' : 'secondary'}` : '';
      const notice =
        track.warnings.length > 0
          ? `Loaded ${track.cues.length} lines${where}, with ${track.warnings.length} warning(s).`
          : `Loaded ${track.cues.length} lines${where}.`;

      const slots = loadIntoSlot(get().slots, id, track);
      set({ slots, notice, prefs: { ...get().prefs, tab: 'sync' } });
      persist(slots);

      log.info('panel', 'subtitles loaded', {
        slot: id,
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
      // The slot keeps whatever it had. A failed read is not a reason to throw away a
      // track that is working.
      set({ error: message });
      log.warn('panel', 'subtitle load failed', message);
    }
  },

  clearTrack() {
    const id = activeId(get());
    get().bridge?.overlay.setTrack(id, null);
    get().bridge?.overlay.setSync(id, IDENTITY_SYNC);

    const slots = clearSlot(get().slots, id);
    set({ slots, notice: null, error: null });
    persist(slots);
  },

  setActiveSlot(id) {
    set({ activeSlot: id, error: null, notice: null });
  },

  setDual(patch) {
    const dual = { ...get().dual, ...patch };
    get().bridge?.overlay.setStyles(get().styles, dual);

    // Switching dual off leaves the secondary's track and timing alone but stops it being
    // addressable — otherwise the panel would sit on a slot that is not rendering, and
    // every control would appear to do nothing.
    set({ dual, activeSlot: dual.enabled ? get().activeSlot : 0 });
    persistDual(dual);
  },

  setSlotVisible(id, visible) {
    get().bridge?.overlay.setSlotVisible(id, visible);
    set({ slots: withSlot(get().slots, id, { visible }) });
  },

  /* -------------------------------------------------------------------- sync */

  setClickMode(mode) {
    set({ clickMode: mode });
  },

  /**
   * Apply a new timing to the active slot.
   *
   * Every sync action funnels through here, so "which track am I adjusting" is answered
   * once. The other slot is untouched, which is the whole point of per-slot timing: two
   * tracks for one film are almost never cut from the same release.
   */
  applySync(next: SyncState, notice: string | null) {
    const id = activeId(get());
    get().bridge?.overlay.setSync(id, next);

    const slots = setSlotSync(get().slots, id, next);
    set({ slots, error: null, ...(notice === null ? {} : { notice }) });
    persist(slots);
  },

  syncToCue(cue) {
    const { bridge, clickMode } = get();
    if (!bridge) return;

    if (clickMode === 'anchorA') {
      get().setAnchor(0, cue);
      return;
    }
    if (clickMode === 'anchorB') {
      get().setAnchor(1, cue);
      return;
    }

    const sync = activeSync(get());
    const next = onePointFit(sync, makeAnchor(cue, bridge.video.currentTime));
    get().applySync(next, `Shifted by ${next.offset >= 0 ? '+' : ''}${next.offset.toFixed(2)}s.`);
  },

  setAnchor(anchorSlot, cue) {
    const { bridge } = get();
    if (!bridge) return;

    const sync = activeSync(get());
    const anchors: SyncState['anchors'] = [...sync.anchors];
    anchors[anchorSlot] = makeAnchor(cue, bridge.video.currentTime);

    set({ clickMode: 'quick' });
    get().applySync({ ...sync, anchors }, `Anchor ${anchorSlot === 0 ? 'A' : 'B'} set.`);
  },

  clearAnchors() {
    get().applySync({ ...activeSync(get()), anchors: [null, null] }, null);
    set({ notice: null });
  },

  applyDriftFit() {
    const { bridge } = get();
    const [a, b] = activeSync(get()).anchors;
    if (!a || !b || !bridge) {
      set({ error: 'Set both anchors first.' });
      return;
    }

    const result = twoPointFit(a, b);
    if (!result.ok) {
      set({ error: result.error, notice: null });
      return;
    }

    const drift = result.driftPerHour;
    get().applySync(
      result.sync,
      `Rate set to ${(result.scale * 100).toFixed(2)}% — that was ${Math.abs(drift).toFixed(0)}s of drift per hour.`,
    );
  },

  applyScale(scale) {
    if (!get().bridge) return;
    const sync = activeSync(get());

    // Keep the first anchor pinned so snapping the rate doesn't shift the whole track.
    const anchor = sync.anchors[0];
    const offset = anchor ? anchor.videoTime - anchor.cueStart * scale : sync.offset;

    get().applySync({ ...sync, scale, offset }, `Rate set to ${(scale * 100).toFixed(3)}%.`);
  },

  nudge(delta) {
    if (!get().bridge) return;
    const next = nudgeSync(activeSync(get()), delta);
    get().applySync(next, `Offset ${next.offset >= 0 ? '+' : ''}${next.offset.toFixed(2)}s.`);
  },

  resetTiming() {
    get().applySync(resetSync(), 'Timing reset.');
  },

  setStyle(patch) {
    const id = activeId(get());
    const styles: [SubtitleStyle, SubtitleStyle] = [...get().styles];
    styles[id] = clampStyle({ ...styles[id], ...patch });

    get().bridge?.overlay.setStyles(styles, get().dual);
    set({ styles });
    persistStyles(styles);
  },

  replaceStyle(style) {
    const id = activeId(get());
    const styles: [SubtitleStyle, SubtitleStyle] = [...get().styles];
    styles[id] = clampStyle(style);

    get().bridge?.overlay.setStyles(styles, get().dual);
    set({ styles });
    persistStyles(styles);
  },

  /** Put the secondary back to "the primary, smaller and dimmer". */
  resetSecondaryStyle() {
    const styles: [SubtitleStyle, SubtitleStyle] = [
      get().styles[0],
      defaultSecondaryStyle(get().styles[0]),
    ];
    get().bridge?.overlay.setStyles(styles, get().dual);
    set({ styles, notice: 'Secondary style matched to the primary.' });
    persistStyles(styles);
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
