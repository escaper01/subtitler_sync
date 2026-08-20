import { create } from 'zustand';
import type { Cue, DualLayout, SlotId, SubtitleStyle, SyncState } from '@/types';
import { DEFAULT_DUAL_LAYOUT, IDENTITY_SYNC } from '@/types';
import type { ApiErrorCode, Release, ReleaseResponse, SearchResponse, Track } from '@/lib/api-types';
import type { ApiResult } from '@/lib/api';
import type { SubtitleOverlay } from '@/content/overlay';
import type { SubtitleTrack, TrackSlot } from '@/types';
import { parseSubtitleFile, parseSubtitleText, SubtitleParseError } from '@/lib/subtitles/parse';
import { clampStyle, DEFAULT_STYLE, defaultSecondaryStyle } from '@/lib/style';
import type { Slots } from '@/lib/slots';
import { clearSlot, emptySlots, loadIntoSlot, setSlotSync, withSlot } from '@/lib/slots';
import { askBackground } from '@/lib/messaging';
import { guessSearchTitle } from '@/lib/searchTitle';
import { DEFAULT_LANGUAGE } from '@/lib/languages';
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
import {
  loadLanguage,
  loadLanguage2,
  saveLanguage,
  saveLanguage2,
} from '@/lib/searchStorage';
import { makeAnchor, nudge as nudgeSync, onePointFit, resetSync, twoPointFit } from '@/lib/sync';
import { videoKey } from '@/lib/videoKey';
import { log } from '@/lib/log';

/** What clicking a line in the cue list does. */
export type ClickMode = 'quick' | 'anchorA' | 'anchorB';

/**
 * Subtitle search state.
 *
 * Kept in the store rather than in the Find tab so that results survive a trip to the Sync
 * tab — searching, loading a track and then realigning it is one continuous job.
 */
export interface FindState {
  query: string;
  status: 'idle' | 'searching' | 'done';
  error: string | null;
  /**
   * Why the last request was refused, when it was refused for a reason the user can do
   * something about. Kept *alongside* `error` rather than replacing it, so every existing
   * render path keeps working and only the gated ones grow a button.
   */
  code: ApiErrorCode | null;
  action: { label: string; url: string } | null;
  /** 1-based, and only ever one page's worth of releases is held. */
  page: number;
  total: number;
  hasMore: boolean;
  releases: Release[];
  /**
   * Tracks per release id. A missing key means "not fetched yet"; an empty array means
   * "fetched, and this release has nothing in your languages" — a distinction the UI has
   * to make or it shows a permanent spinner on releases that are simply empty.
   */
  tracks: Record<string, Track[] | undefined>;
  /** Ids the user opened that we are still fetching. */
  expanding: string[];
  /**
   * Tracks per release in the **second** language, fetched one release at a time.
   *
   * Deliberately not filled in by the search. Expanding all five results in a second
   * language would double the upstream work of every page, and the release/download
   * allowance is only three times the search one — a page of five would spend it inside
   * an hour. So this is populated by `loadReleaseInto`, for the one release the user
   * actually asked about.
   */
  tracks2: Record<string, Track[] | undefined>;
  /** Release id whose second-language lookup is in flight. */
  fetchingSecond: string | null;
  /** `releaseId/code` of the track currently downloading. */
  loading: string | null;
  /** Which slot that download is bound for, so the right button shows the spinner. */
  loadingSlot: SlotId | null;
}

const EMPTY_FIND: FindState = {
  query: '',
  status: 'idle',
  error: null,
  code: null,
  action: null,
  page: 1,
  total: 0,
  hasMore: false,
  releases: [],
  tracks: {},
  expanding: [],
  tracks2: {},
  fetchingSecond: null,
  loading: null,
  loadingSlot: null,
};

export function trackKey(track: Track): string {
  return `${track.releaseId}/${track.code}`;
}

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
  /** The subtitle language search results are filtered to. */
  language: string;
  /**
   * The language of the second track, used only when dual subtitles are on.
   *
   * Separate from `language` rather than derived from the active slot: the search runs in
   * one language, and the second is fetched per release on demand. Tying it to the slot
   * would mean re-running the whole search to get the other half of a pair you have
   * already chosen.
   */
  language2: string;
  find: FindState;

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

  setLanguage: (code: string) => void;
  setLanguage2: (code: string) => void;
  setQuery: (query: string) => void;
  runSearch: (page?: number) => Promise<void>;
  toggleRelease: (release: Release) => Promise<void>;
  /** Download a track and put it in a slot. Defaults to whichever slot is selected. */
  loadTrack: (track: Track, slot?: SlotId) => Promise<void>;
  /** Fetch one release in the second language and load it into the secondary slot. */
  loadReleaseInto: (release: Release, slot: SlotId) => Promise<void>;

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
  language: DEFAULT_LANGUAGE,
  language2: DEFAULT_LANGUAGE,
  find: EMPTY_FIND,

  open: true,
  subtitlesVisible: true,
  clickMode: 'quick',

  error: null,
  notice: null,

  time: 0,
  duration: 0,

  async init(bridge) {
    set({ bridge });

    const [styles, dual, prefs, movie, language, pageTitle] = await Promise.all([
      loadStyles(),
      loadDual(),
      loadPanelPrefs(),
      loadMovie(videoKey()),
      loadLanguage(),
      askBackground<string | null>({ kind: 'get-page-title' }),
    ]);

    // After the primary, because it falls back to it rather than to English — proposing a
    // language the user does not read is worse than proposing the one they just picked.
    const language2 = await loadLanguage2(language);

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
      language,
      language2,
      // Seeded, not searched: the guess is often right but sometimes comically wrong, and
      // firing a request off the back of a wrong guess wastes everyone's time.
      find: { ...EMPTY_FIND, query: guessSearchTitle(pageTitle) },
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

  /* ------------------------------------------------------------------ search */

  setLanguage(code) {
    if (code === get().language) return;

    set({ language: code });
    void saveLanguage(code);

    // Every track on screen was filtered to the old language, so the results are now a
    // lie. Re-run rather than clear: the query has not changed and the search itself is
    // cached upstream, so this costs the detail fetches only.
    if (get().find.status === 'done') void get().runSearch(get().find.page);
  },

  setLanguage2(code) {
    if (code === get().language2) return;
    set({ language2: code });
    void saveLanguage2(code);

    // Anything already fetched was fetched in the old language, so it is now a lie. The
    // primary results are untouched — only the second-language column is discarded, and it
    // refetches per release on demand anyway.
    set({ find: { ...get().find, tracks2: {} } });
  },

  setQuery(query) {
    set({ find: { ...get().find, query } });
  },

  async runSearch(page = 1) {
    const { find, language } = get();
    const query = find.query.trim();
    if (query.length === 0 || find.status === 'searching') return;

    // A page replaces the previous one rather than appending: five releases, each with one
    // language, is a list you read — not one you scroll.
    set({ find: { ...EMPTY_FIND, query, page, status: 'searching' } });

    const result = await askBackground<ApiResult<SearchResponse>>({
      kind: 'api:search',
      query,
      lang: language,
      page,
    });

    // A null answer means the worker never replied — it was restarting, or the extension
    // was reloaded out from under us.
    if (!result) {
      set({ find: { ...get().find, status: 'done', error: 'The extension went away. Try again.' } });
      return;
    }

    if (!result.ok) {
      set({
        find: {
          ...get().find,
          status: 'done',
          error: result.error,
          code: result.code ?? null,
          action: result.action ?? null,
        },
      });
      return;
    }

    // The search response already carries the tracks of the releases it expanded eagerly.
    const tracks: Record<string, Track[]> = {};
    for (const id of result.data.expanded) tracks[id] = [];
    for (const track of result.data.tracks) tracks[track.releaseId]?.push(track);

    set({
      find: {
        ...get().find,
        status: 'done',
        error: null,
        page: result.data.page,
        total: result.data.total,
        hasMore: result.data.hasMore,
        releases: result.data.releases,
        tracks,
      },
    });

    log.info('find', 'search done', {
      query,
      language,
      page: result.data.page,
      of: result.data.total,
      releases: result.data.releases.length,
    });
  },

  async toggleRelease(release) {
    const find = get().find;

    // Already fetched: collapsing is the UI's business, so there is nothing to do here.
    if (find.tracks[release.id] !== undefined) return;
    if (find.expanding.includes(release.id)) return;

    set({ find: { ...find, expanding: [...find.expanding, release.id] } });

    const result = await askBackground<ApiResult<ReleaseResponse>>({
      kind: 'api:release',
      path: release.path,
      lang: get().language,
    });

    const done = get().find;
    const expanding = done.expanding.filter((id) => id !== release.id);

    if (!result || !result.ok) {
      set({
        find: {
          ...done,
          expanding,
          error: result?.ok === false ? result.error : 'Could not open that release.',
          code: result?.ok === false ? (result.code ?? null) : null,
          action: result?.ok === false ? (result.action ?? null) : null,
        },
      });
      return;
    }

    set({
      find: {
        ...done,
        expanding,
        error: null,
        tracks: { ...done.tracks, [release.id]: result.data.tracks },
      },
    });
  },

  async loadTrack(track, slot) {
    const key = trackKey(track);
    if (get().find.loading) return;

    // An explicit slot wins over the selector. The Find tab passes one because a result
    // row offers both, and "load this as the second subtitle" should not depend on having
    // remembered to flip a toggle at the top of the panel first.
    const id = slot ?? activeId(get());

    set({
      find: { ...get().find, loading: key, loadingSlot: id, error: null },
      error: null,
      notice: null,
    });

    const result = await askBackground<ApiResult<{ text: string; filename: string }>>({
      kind: 'api:download',
      path: track.path,
    });

    if (!result || !result.ok) {
      // A gated download is shown in the Find tab beside the button that caused it, not
      // as a panel-wide banner — the user is looking at the release they just clicked.
      const gated = result?.ok === false && result.code !== undefined;
      set({
        find: {
          ...get().find,
          loading: null,
          loadingSlot: null,
          error: result?.ok === false ? result.error : 'Could not download that subtitle.',
          code: result?.ok === false ? (result.code ?? null) : null,
          action: result?.ok === false ? (result.action ?? null) : null,
        },
        error: gated ? null : result?.ok === false ? result.error : 'Could not download that subtitle.',
      });
      return;
    }

    try {
      const parsed = parseSubtitleText(result.data.text, result.data.filename);
      get().bridge?.overlay.setTrack(id, parsed);
      get().bridge?.overlay.setSync(id, IDENTITY_SYNC);

      const slots = loadIntoSlot(get().slots, id, parsed);
      const dual = get().dual.enabled;
      set({
        slots,
        find: { ...get().find, loading: null, loadingSlot: null },
        // Say which slot it went into once there are two, or a track landing somewhere
        // unexpected reads as nothing having happened.
        notice: dual
          ? `Loaded ${parsed.cues.length} lines in ${track.name} as the ${id === 0 ? 'primary' : 'secondary'}.`
          : `Loaded ${parsed.cues.length} lines in ${track.name}.`,
        // Straight to Sync, but only for the slot the user is already editing — hopping
        // tabs while they are part-way through loading a pair is worse than staying put.
        prefs: id === activeId(get()) ? { ...get().prefs, tab: 'sync' } : get().prefs,
        activeSlot: dual ? id : get().activeSlot,
      });
      persist(slots);

      log.info('find', 'loaded fetched subtitles', {
        slot: id,
        language: track.code,
        cues: parsed.cues.length,
        name: parsed.name,
      });
    } catch (err) {
      const message =
        err instanceof SubtitleParseError
          ? err.message
          : `Could not read that subtitle. ${err instanceof Error ? err.message : ''}`;
      set({ find: { ...get().find, loading: null, loadingSlot: null }, error: message });
      log.warn('find', 'fetched subtitle failed to parse', message);
    }
  },

  /**
   * Fetch one release in the second language, and load it into a slot.
   *
   * The pairing this whole feature exists for: you have already picked a release for the
   * primary, and the *same* release in another language is the one most likely to share
   * its timing — so the second track often needs no syncing at all once the first is
   * aligned.
   *
   * One request, for one release, when the button is pressed. Expanding every result in a
   * second language would double the upstream cost of every search, and the release
   * allowance is only three times the search one.
   */
  async loadReleaseInto(release, slot) {
    const { language2, find } = get();
    if (find.fetchingSecond || find.loading) return;

    // Already looked up: skip straight to the download.
    const cached = find.tracks2[release.id];
    if (cached !== undefined) {
      const first = cached[0];
      if (!first) {
        set({ find: { ...get().find, error: `Not available in that language.` } });
        return;
      }
      await get().loadTrack(first, slot);
      return;
    }

    set({ find: { ...find, fetchingSecond: release.id, error: null }, error: null });

    const result = await askBackground<ApiResult<ReleaseResponse>>({
      kind: 'api:release',
      path: release.path,
      lang: language2,
    });

    const done = get().find;

    if (!result || !result.ok) {
      set({
        find: {
          ...done,
          fetchingSecond: null,
          error: result?.ok === false ? result.error : 'Could not open that release.',
          code: result?.ok === false ? (result.code ?? null) : null,
          action: result?.ok === false ? (result.action ?? null) : null,
        },
      });
      return;
    }

    const tracks = result.data.tracks;
    set({
      find: {
        ...done,
        fetchingSecond: null,
        // Cached even when empty, so a release with nothing in that language is not
        // refetched every time the user presses the button again.
        tracks2: { ...done.tracks2, [release.id]: tracks },
      },
    });

    const first = tracks[0];
    if (!first) {
      set({ find: { ...get().find, error: 'This release has nothing in that language.' } });
      return;
    }

    await get().loadTrack(first, slot);
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
