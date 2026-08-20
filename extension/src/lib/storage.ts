import type { DualLayout, SubtitleStyle, SubtitleTrack, SyncState } from '@/types';
import { DEFAULT_DUAL_LAYOUT, IDENTITY_SYNC } from '@/types';
import { clampStyle, DEFAULT_STYLE, defaultSecondaryStyle } from '@/lib/style';
import { DEFAULT_LANGUAGE, isKnownLanguage } from '@/lib/languages';
import type { RememberedShow } from '@/lib/tv';
import { MAX_REMEMBERED_SHOWS } from '@/lib/tv';
import { contextAlive } from '@/lib/log';

/**
 * Persistence.
 *
 * Appearance goes in `storage.sync` — it's small, and it should follow the user between
 * machines. Per-film state (the subtitle file and its timing) goes in `storage.local`,
 * because tracks are ~100 KB each and would blow through the sync quota immediately.
 */

const STYLE_KEY = 'style';
/** The secondary track's appearance. A separate key so an old `style` still loads as-is. */
const STYLE2_KEY = 'style2';
const DUAL_KEY = 'dual';
const PANEL_KEY = 'panel';
const LANGS_KEY = 'langs';
const MOVIE_PREFIX = 'movie:';
const SHOWS_KEY = 'tv:recent';

/**
 * Films to remember before evicting the least recently used.
 *
 * Twelve, down from twenty: a film can now hold two tracks, so the same allowance would
 * be roughly twice the bytes against the same 10 MB quota.
 */
const MAX_REMEMBERED_MOVIES = 12;

/** One slot's saved state. */
export interface SlotSave {
  track: SubtitleTrack | null;
  sync: SyncState;
}

export interface MovieState {
  slots: [SlotSave, SlotSave];
  updatedAt: number;

  /**
   * What versions before dual subtitles wrote. Read by `loadMovie`, never written.
   *
   * Kept because throwing it away would silently discard a timing somebody spent real
   * effort fitting — the same reason the language loader still accepts the array the old
   * `langs` key held.
   */
  sync?: SyncState;
  track?: SubtitleTrack | null;
}

export interface PanelPrefs {
  collapsed: boolean;
  x: number;
  y: number;
  tab: 'subtitles' | 'find' | 'style' | 'sync' | 'sites';
}

export const DEFAULT_PANEL_PREFS: PanelPrefs = {
  collapsed: false,
  x: 16,
  y: 16,
  tab: 'subtitles',
};

/* ----------------------------------------------------------------------- style */

/**
 * Both tracks' appearance, and how they stack.
 *
 * Three keys rather than one object, so nothing needs migrating: a `style` written before
 * dual subtitles existed loads unchanged as the primary, and a missing `style2` or `dual`
 * simply falls back. The merge-over-defaults trick does the rest — a style saved by an
 * older version, missing fields added since, loads instead of rendering `undefined`.
 */
export async function loadStyles(): Promise<[SubtitleStyle, SubtitleStyle]> {
  if (!contextAlive()) return [DEFAULT_STYLE, defaultSecondaryStyle(DEFAULT_STYLE)];
  try {
    const stored = await chrome.storage.sync.get([STYLE_KEY, STYLE2_KEY]);

    const primary = readStyle(stored[STYLE_KEY], DEFAULT_STYLE);
    // The secondary defaults from the *primary*, not from DEFAULT_STYLE: someone who has
    // set up their subtitles the way they like should get a second line that matches,
    // smaller — not the factory look beside their own.
    const secondary = readStyle(stored[STYLE2_KEY], defaultSecondaryStyle(primary));

    return [primary, secondary];
  } catch {
    return [DEFAULT_STYLE, defaultSecondaryStyle(DEFAULT_STYLE)];
  }
}

function readStyle(value: unknown, fallback: SubtitleStyle): SubtitleStyle {
  const partial = value as Partial<SubtitleStyle> | undefined;
  return partial ? clampStyle({ ...fallback, ...partial }) : fallback;
}

export async function saveStyles(styles: readonly [SubtitleStyle, SubtitleStyle]): Promise<void> {
  if (!contextAlive()) return;
  try {
    await chrome.storage.sync.set({ [STYLE_KEY]: styles[0], [STYLE2_KEY]: styles[1] });
  } catch {
    /* quota exceeded or offline — appearance is not worth surfacing an error for */
  }
}

export async function loadDual(): Promise<DualLayout> {
  if (!contextAlive()) return DEFAULT_DUAL_LAYOUT;
  try {
    const stored = await chrome.storage.sync.get(DUAL_KEY);
    const value = stored[DUAL_KEY] as Partial<DualLayout> | undefined;
    return value ? { ...DEFAULT_DUAL_LAYOUT, ...value } : DEFAULT_DUAL_LAYOUT;
  } catch {
    return DEFAULT_DUAL_LAYOUT;
  }
}

export async function saveDual(layout: DualLayout): Promise<void> {
  if (!contextAlive()) return;
  try {
    await chrome.storage.sync.set({ [DUAL_KEY]: layout });
  } catch {
    /* ignore */
  }
}

/* ------------------------------------------------------------------- language */

/**
 * Which subtitle language to search in.
 *
 * In `storage.sync` alongside the style: it's one code, and the language you read
 * subtitles in does not change per machine.
 *
 * One language, not several. The API takes exactly one — a result list mixing languages
 * reads as noise, and the whole point of the filter is to cut the ~150 machine
 * translations each release carries down to the one that is any use.
 */
export async function loadLanguage(): Promise<string> {
  if (!contextAlive()) return DEFAULT_LANGUAGE;
  try {
    const stored = await chrome.storage.sync.get(LANGS_KEY);
    const value = stored[LANGS_KEY] as unknown;

    // Earlier versions stored an array. Take the first entry rather than resetting to
    // English, so someone who had picked, say, Arabic keeps it.
    const code = Array.isArray(value) ? value[0] : value;
    return typeof code === 'string' && isKnownLanguage(code) ? code : DEFAULT_LANGUAGE;
  } catch {
    return DEFAULT_LANGUAGE;
  }
}

export async function saveLanguage(code: string): Promise<void> {
  if (!contextAlive()) return;
  try {
    await chrome.storage.sync.set({ [LANGS_KEY]: code });
  } catch {
    /* quota or offline — the picker still reflects the choice for this session */
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

/* -------------------------------------------------------------------- series */

/**
 * Shows the user has browsed, and where they got to in each.
 *
 * `storage.local`, not `sync`: it is a watching position, not a preference, and the whole
 * point is that it is instantly right on the machine you are actually watching on — a sync
 * round trip that occasionally resolves stale would be worse than not syncing at all.
 *
 * Reading tolerates anything: a corrupt entry drops out rather than taking the list with
 * it, because losing "where I got to in one show" beats losing all eight.
 */
export async function loadShows(): Promise<RememberedShow[]> {
  if (!contextAlive()) return [];
  try {
    const stored = await chrome.storage.local.get(SHOWS_KEY);
    const value = stored[SHOWS_KEY];
    if (!Array.isArray(value)) return [];

    const out: RememberedShow[] = [];
    for (const raw of value) {
      const row = raw as Partial<RememberedShow> | null;
      if (typeof row?.showId !== 'number' || typeof row.name !== 'string') continue;
      if (typeof row.season !== 'number' || typeof row.episode !== 'number') continue;
      out.push({
        showId: row.showId,
        name: row.name,
        season: row.season,
        episode: row.episode,
        lastUsedAt: typeof row.lastUsedAt === 'number' ? row.lastUsedAt : 0,
      });
    }
    return out.slice(0, MAX_REMEMBERED_SHOWS);
  } catch {
    return [];
  }
}

export async function saveShows(shows: readonly RememberedShow[]): Promise<void> {
  if (!contextAlive()) return;
  try {
    await chrome.storage.local.set({ [SHOWS_KEY]: shows.slice(0, MAX_REMEMBERED_SHOWS) });
  } catch {
    /* ignore */
  }
}

/* ------------------------------------------------------------------ per-film */

const EMPTY_SLOT_SAVE: SlotSave = { track: null, sync: IDENTITY_SYNC };

/**
 * Read one film's saved slots, lifting a pre-dual save into the primary.
 *
 * The legacy shape had one `track` and one `sync` at the top level. Those become slot 0
 * with slot 1 empty, which is exactly what the user had — so upgrading loses nothing and
 * needs no migration pass over storage.
 */
export function toSlots(value: MovieState): [SlotSave, SlotSave] {
  if (Array.isArray(value.slots) && value.slots.length === 2) {
    return [readSlot(value.slots[0]), readSlot(value.slots[1])];
  }
  return [
    { track: value.track ?? null, sync: { ...IDENTITY_SYNC, ...value.sync } },
    { ...EMPTY_SLOT_SAVE },
  ];
}

function readSlot(raw: SlotSave | undefined): SlotSave {
  return { track: raw?.track ?? null, sync: { ...IDENTITY_SYNC, ...raw?.sync } };
}

export async function loadMovie(key: string): Promise<MovieState | null> {
  if (!contextAlive()) return null;
  try {
    const storageKey = MOVIE_PREFIX + key;
    const stored = await chrome.storage.local.get(storageKey);
    const value = stored[storageKey] as MovieState | undefined;
    if (!value) return null;

    return { slots: toSlots(value), updatedAt: value.updatedAt ?? 0 };
  } catch {
    return null;
  }
}

export async function saveMovie(key: string, state: MovieState): Promise<void> {
  if (!contextAlive()) return;
  const record = { slots: state.slots, updatedAt: Date.now() };
  try {
    await chrome.storage.local.set({ [MOVIE_PREFIX + key]: record });
    await pruneMovies();
  } catch (err) {
    // The most likely failure is the 10 MB local quota, and two tracks per film makes it
    // likelier than it was. Drop the cues and keep the timing, which is the part that took
    // the user effort to produce — a track can be reloaded, a two-point drift fit cannot.
    try {
      await chrome.storage.local.set({
        [MOVIE_PREFIX + key]: {
          slots: [
            { track: null, sync: state.slots[0].sync },
            { track: null, sync: state.slots[1].sync },
          ],
          updatedAt: Date.now(),
        },
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
    .map(([key, value]) => ({ key, updatedAt: (value as MovieState).updatedAt ?? 0 }));

  if (entries.length <= MAX_REMEMBERED_MOVIES) return;

  entries.sort((a, b) => a.updatedAt - b.updatedAt);
  const stale = entries.slice(0, entries.length - MAX_REMEMBERED_MOVIES).map((entry) => entry.key);
  if (stale.length > 0) await chrome.storage.local.remove(stale);
}
