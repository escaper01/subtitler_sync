import type { SubtitleStyle, SubtitleTrack, SyncState } from '@/types';
import { IDENTITY_SYNC } from '@/types';
import { clampStyle, DEFAULT_STYLE } from '@/lib/style';
import { contextAlive } from '@/lib/log';

/**
 * Persistence.
 *
 * Appearance goes in `storage.sync` — it's small, and it should follow the user between
 * machines. Per-film state (the subtitle file and its timing) goes in `storage.local`,
 * because tracks are ~100 KB each and would blow through the sync quota immediately.
 */

const STYLE_KEY = 'style';
const PANEL_KEY = 'panel';
const MOVIE_PREFIX = 'movie:';

/** Films to remember before evicting the least recently used. */
const MAX_REMEMBERED_MOVIES = 20;

export interface MovieState {
  sync: SyncState;
  track: SubtitleTrack | null;
  updatedAt: number;
}

export interface PanelPrefs {
  collapsed: boolean;
  x: number;
  y: number;
  tab: 'subtitles' | 'style' | 'sync';
}

export const DEFAULT_PANEL_PREFS: PanelPrefs = {
  collapsed: false,
  x: 16,
  y: 16,
  tab: 'subtitles',
};

/* ----------------------------------------------------------------------- style */

export async function loadStyle(): Promise<SubtitleStyle> {
  if (!contextAlive()) return DEFAULT_STYLE;
  try {
    const stored = await chrome.storage.sync.get(STYLE_KEY);
    const value = stored[STYLE_KEY] as Partial<SubtitleStyle> | undefined;
    // Merge over the defaults so a style saved by an older version, missing fields added
    // since, still loads instead of rendering with `undefined` everywhere.
    return value ? clampStyle({ ...DEFAULT_STYLE, ...value }) : DEFAULT_STYLE;
  } catch {
    return DEFAULT_STYLE;
  }
}

export async function saveStyle(style: SubtitleStyle): Promise<void> {
  if (!contextAlive()) return;
  try {
    await chrome.storage.sync.set({ [STYLE_KEY]: style });
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
    return { ...DEFAULT_PANEL_PREFS, ...value };
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
    const value = stored[storageKey] as MovieState | undefined;
    if (!value) return null;

    return {
      sync: { ...IDENTITY_SYNC, ...value.sync },
      track: value.track ?? null,
      updatedAt: value.updatedAt ?? 0,
    };
  } catch {
    return null;
  }
}

export async function saveMovie(key: string, state: MovieState): Promise<void> {
  if (!contextAlive()) return;
  try {
    await chrome.storage.local.set({ [MOVIE_PREFIX + key]: { ...state, updatedAt: Date.now() } });
    await pruneMovies();
  } catch (err) {
    // The most likely failure is the 10 MB local quota with a very large track. Drop the
    // cues and keep the timing, which is the part that took the user effort to produce.
    if (state.track) {
      try {
        await chrome.storage.local.set({
          [MOVIE_PREFIX + key]: { sync: state.sync, track: null, updatedAt: Date.now() },
        });
      } catch {
        /* give up */
      }
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
    .map(([key, value]) => ({ key, updatedAt: (value as MovieState).updatedAt ?? 0 }));

  if (entries.length <= MAX_REMEMBERED_MOVIES) return;

  entries.sort((a, b) => a.updatedAt - b.updatedAt);
  const stale = entries.slice(0, entries.length - MAX_REMEMBERED_MOVIES).map((entry) => entry.key);
  if (stale.length > 0) await chrome.storage.local.remove(stale);
}
