import type { RememberedShow } from '@/lib/tv';
import { MAX_REMEMBERED_SHOWS } from '@/lib/tv';
import { DEFAULT_LANGUAGE, isKnownLanguage } from '@/lib/languages';
import { contextAlive } from '@/lib/log';

/**
 * Persistence for the things only the search build has.
 *
 * Split out of `storage.ts` for one reason: that file is copied verbatim into the
 * search-free build, and an import of `languages.ts` or `tv.ts` — neither of which exists
 * there — would make it un-copyable. Nothing here is imported by the overlay, the sync
 * tool or the allowlist.
 */

const LANGS_KEY = 'langs';
const SHOWS_KEY = 'tv:recent';

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
