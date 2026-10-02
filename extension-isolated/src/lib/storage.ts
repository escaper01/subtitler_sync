import type { PanelTab, SubtitleStyle, SubtitleTrack, SyncState } from '@/types';
import { IDENTITY_SYNC, PANEL_TABS } from '@/types';
import { clampStyle, DEFAULT_STYLE } from '@/lib/style';
import { contextAlive } from '@/lib/log';

/**
 * Persistence for everything the overlay needs.
 *
 * Appearance goes in `storage.sync` — it's small, and it should follow the user between
 * machines. Per-film state (the subtitle files and their timing) goes in `storage.local`,
 * because tracks are ~100 KB each and would blow through the sync quota immediately.
 *
 * The search language and the remembered series live in `lib/searchStorage.ts` instead.
 */

const STYLE_KEY = 'style';
/** Keys an earlier version wrote for a second track. Never read; removed when style saves. */
const LEGACY_KEYS = ['style2', 'dual'];
const PANEL_KEY = 'panel';
const MOVIE_PREFIX = 'movie:';

/** Films to remember before evicting the least recently used. */
const MAX_REMEMBERED_MOVIES = 20;

/** What is remembered about one film: its subtitle track and the timing fitted to it. */
export interface MovieState {
  track: SubtitleTrack | null;
  sync: SyncState;
  updatedAt: number;
}

/**
 * What an older version may have written for a film: a pair of slots. Only the first is
 * kept — it was the primary, which is the track a single-track user always had.
 */
interface StoredMovie {
  track?: SubtitleTrack | null;
  sync?: SyncState;
  slots?: { track?: SubtitleTrack | null; sync?: SyncState }[];
  updatedAt?: number;
}

export interface PanelPrefs {
  collapsed: boolean;
  x: number;
  y: number;
  tab: PanelTab;
}

export const DEFAULT_PANEL_PREFS: PanelPrefs = {
  collapsed: false,
  x: 16,
  y: 16,
  tab: 'subtitles',
};

/* ----------------------------------------------------------------------- style */

/**
 * The subtitle appearance. Merged over the defaults, so a style saved by an older version —
 * missing fields added since — loads instead of rendering `undefined`.
 */
export async function loadStyle(): Promise<SubtitleStyle> {
  if (!contextAlive()) return DEFAULT_STYLE;
  try {
    const stored = await chrome.storage.sync.get(STYLE_KEY);
    const partial = stored[STYLE_KEY] as Partial<SubtitleStyle> | undefined;
    return partial ? clampStyle({ ...DEFAULT_STYLE, ...partial }) : DEFAULT_STYLE;
  } catch {
    return DEFAULT_STYLE;
  }
}

export async function saveStyle(style: SubtitleStyle): Promise<void> {
  if (!contextAlive()) return;
  try {
    await chrome.storage.sync.set({ [STYLE_KEY]: style });
    await chrome.storage.sync.remove(LEGACY_KEYS);
  } catch {
    /* quota exceeded or offline — appearance is not worth surfacing an error for */
  }
}

/* ---------------------------------------------------------------- panel layout */

export async function loadPanelPrefs(): Promise<PanelPrefs> {
  if (!contextAlive()) return DEFAULT_PANEL_PREFS;
  try {
    const stored = await chrome.storage.local.get(PANEL_KEY);
    const value = stored[PANEL_KEY] as Partial<PanelPrefs> | undefined;
    const prefs = { ...DEFAULT_PANEL_PREFS, ...value };

    // Both builds share this storage key and they do not have the same tabs. Without this,
    // a profile that has run the other build opens on a tab that renders nothing.
    if (!PANEL_TABS.includes(prefs.tab)) prefs.tab = DEFAULT_PANEL_PREFS.tab;

    return prefs;
  } catch {
    return DEFAULT_PANEL_PREFS;
  }
}

export async function savePanelPrefs(prefs: PanelPrefs): Promise<void> {
  if (!contextAlive()) return;
  try {
    await chrome.storage.local.set({ [PANEL_KEY]: prefs });
  } catch {
    /* ignore */
  }
}

/* ------------------------------------------------------------------ per-film */

export async function loadMovie(key: string): Promise<MovieState | null> {
  if (!contextAlive()) return null;
  try {
    const storageKey = MOVIE_PREFIX + key;
    const stored = await chrome.storage.local.get(storageKey);
    const value = stored[storageKey] as StoredMovie | undefined;
    if (!value) return null;

    // A dual-era record keeps its primary in `slots[0]`; an older one has it at the top.
    const saved = Array.isArray(value.slots) ? value.slots[0] : value;
    return {
      track: saved?.track ?? null,
      sync: { ...IDENTITY_SYNC, ...saved?.sync },
      updatedAt: value.updatedAt ?? 0,
    };
  } catch {
    return null;
  }
}

export async function saveMovie(key: string, state: MovieState): Promise<void> {
  if (!contextAlive()) return;
  const record = { track: state.track, sync: state.sync, updatedAt: Date.now() };
  try {
    await chrome.storage.local.set({ [MOVIE_PREFIX + key]: record });
    await pruneMovies();
  } catch (err) {
    // The most likely failure is the 10 MB local quota. Drop the cues and keep the timing,
    // which is the part that took the user effort to produce — a track can be reloaded, a
    // two-point drift fit cannot.
    try {
      await chrome.storage.local.set({
        [MOVIE_PREFIX + key]: { track: null, sync: state.sync, updatedAt: Date.now() },
      });
    } catch {
      /* give up */
    }
    console.warn('[subtitler] could not save film state', err);
  }
}

export async function forgetMovie(key: string): Promise<void> {
  if (!contextAlive()) return;
  try {
    await chrome.storage.local.remove(MOVIE_PREFIX + key);
  } catch {
    /* ignore */
  }
}

/** Evict the least recently used films so stored tracks cannot grow without bound. */
async function pruneMovies(): Promise<void> {
  const all = await chrome.storage.local.get(null);
  const entries = Object.entries(all)
    .filter(([key]) => key.startsWith(MOVIE_PREFIX))
    .map(([key, value]) => ({ key, updatedAt: (value as StoredMovie).updatedAt ?? 0 }));

  if (entries.length <= MAX_REMEMBERED_MOVIES) return;

  entries.sort((a, b) => a.updatedAt - b.updatedAt);
  const stale = entries.slice(0, entries.length - MAX_REMEMBERED_MOVIES).map((entry) => entry.key);
  if (stale.length > 0) await chrome.storage.local.remove(stale);
}
