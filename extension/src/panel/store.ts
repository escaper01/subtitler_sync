import { create } from 'zustand';
import type { Cue, SubtitleStyle, SubtitleTrack, SyncState } from '@/types';
import { IDENTITY_SYNC } from '@/types';
import type { ApiErrorCode, Release, ReleaseResponse, SearchResponse, Track } from '@/lib/api-types';
import type { ApiResult } from '@/lib/api';
import type { SubtitleOverlay } from '@/content/overlay';
import { parseSubtitleFile, parseSubtitleText, SubtitleParseError } from '@/lib/subtitles/parse';
import { clampStyle, DEFAULT_STYLE } from '@/lib/style';
import { askBackground } from '@/lib/messaging';
import { guessSearchTitle } from '@/lib/searchTitle';
import { DEFAULT_LANGUAGE } from '@/lib/languages';
import {
  DEFAULT_PANEL_PREFS,
  loadLanguage,
  loadMovie,
  loadPanelPrefs,
  loadStyle,
  saveLanguage,
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
  /** `releaseId/code` of the track currently downloading. */
  loading: string | null;
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
  loading: null,
};

export function trackKey(track: Track): string {
  return `${track.releaseId}/${track.code}`;
}

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
  /** The subtitle language search results are filtered to. */
  language: string;
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

  setLanguage: (code: string) => void;
  setQuery: (query: string) => void;
  runSearch: (page?: number) => Promise<void>;
  toggleRelease: (release: Release) => Promise<void>;
  loadTrack: (track: Track) => Promise<void>;

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
  language: DEFAULT_LANGUAGE,
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

    const [style, prefs, movie, language, pageTitle] = await Promise.all([
      loadStyle(),
      loadPanelPrefs(),
      loadMovie(videoKey()),
      loadLanguage(),
      askBackground<string | null>({ kind: 'get-page-title' }),
    ]);

    bridge.overlay.setStyle(style);
    if (movie?.track) bridge.overlay.setTrack(movie.track);
    if (movie?.sync) bridge.overlay.setSync(movie.sync);

    set({
      style,
      prefs,
      language,
      // Seeded, not searched: the guess is often right but sometimes comically wrong, and
      // firing a request off the back of a wrong guess wastes everyone's time.
      find: { ...EMPTY_FIND, query: guessSearchTitle(pageTitle) },
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

  async loadTrack(track) {
    const key = trackKey(track);
    if (get().find.loading) return;

    set({ find: { ...get().find, loading: key, error: null }, error: null, notice: null });

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
      get().bridge?.overlay.setTrack(parsed);

      set({
        track: parsed,
        find: { ...get().find, loading: null },
        notice: `Loaded ${parsed.cues.length} lines in ${track.name}.`,
        // Straight to Sync: a fetched track is timed against some other release, so it is
        // more likely to need aligning than a file the user picked deliberately.
        prefs: { ...get().prefs, tab: 'sync' },
      });
      persistMovie(videoKey(), get().sync, parsed);

      log.info('find', 'loaded fetched subtitles', {
        language: track.code,
        cues: parsed.cues.length,
        name: parsed.name,
      });
    } catch (err) {
      const message =
        err instanceof SubtitleParseError
          ? err.message
          : `Could not read that subtitle. ${err instanceof Error ? err.message : ''}`;
      set({ find: { ...get().find, loading: null }, error: message });
      log.warn('find', 'fetched subtitle failed to parse', message);
    }
  },

  /* -------------------------------------------------------------------- sync */

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
