import type { Episode, Season, Show } from '@/lib/tv';
import { groupSeasons } from '@/lib/tv';

/**
 * TVmaze, for browsing a series by season and episode. **Runs in the service worker only.**
 *
 * Same rule as `lib/api.ts`, and the same reason: a content script's `fetch` obeys the
 * *page's* CSP and CORS, so calling this from the panel works on the test harness and fails
 * on a site with a strict `connect-src`. The worker's fetch obeys our host permissions,
 * which are already `<all_urls>`.
 *
 * In `extension/` this is the one call that does not go through `web/`; in this build
 * subtitle search joined it, for the same reason: no API key is needed, the contract is
 * stable, and routing it through a server of our own would make the feature stop working
 * whenever that server did.
 *
 * TVmaze publishes a limit of roughly 20 calls per 10 seconds per address. This design
 * cannot approach it: searching for a show needs an explicit press rather than firing per
 * keystroke, and a show's episodes are fetched once and then cached for a week.
 */

const BASE = 'https://api.tvmaze.com';
const TIMEOUT_MS = 12_000;

/** Episode lists for finished seasons do not change. A week is conservative. */
const EPISODES_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const EPISODES_PREFIX = 'tv:eps:';
const SEARCH_PREFIX = 'tv:search:';

/** Bounded so a long list cannot fill the panel or the cache. */
const MAX_RESULTS = 8;

export type TvResult<T> = { ok: true; data: T } | { ok: false; error: string };

/* ------------------------------------------------------------------- fetching */

async function getJson<T>(path: string): Promise<TvResult<T>> {
  let response: Response;
  try {
    response = await fetch(`${BASE}${path}`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (err) {
    const timedOut = err instanceof Error && err.name === 'TimeoutError';
    return { ok: false, error: timedOut ? 'TVmaze timed out.' : 'Could not reach TVmaze.' };
  }

  // 429 is the one worth naming: it is what a burst of typing would produce, and "try
  // again" is actionable where "TVmaze returned 429" is not.
  if (response.status === 429) {
    return { ok: false, error: 'TVmaze is rate limiting us. Try again in a moment.' };
  }
  if (!response.ok) {
    return { ok: false, error: `TVmaze returned ${response.status}.` };
  }

  try {
    return { ok: true, data: (await response.json()) as T };
  } catch {
    return { ok: false, error: 'TVmaze sent something unreadable.' };
  }
}

/* --------------------------------------------------------------------- shapes */

/** Only the fields we read. TVmaze sends a great deal more. */
interface RawShow {
  id?: unknown;
  name?: unknown;
  premiered?: unknown;
  status?: unknown;
  network?: { name?: unknown } | null;
  webChannel?: { name?: unknown } | null;
}

interface RawEpisode {
  season?: unknown;
  number?: unknown;
  name?: unknown;
  airdate?: unknown;
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function readShow(raw: RawShow | undefined): Show | null {
  if (typeof raw?.id !== 'number') return null;
  const name = str(raw.name);
  if (!name) return null;

  return {
    id: raw.id,
    name,
    // `premiered` is a full date; the year is all that helps tell two shows of the same
    // name apart, and it is what everybody remembers.
    year: str(raw.premiered)?.slice(0, 4) ?? null,
    status: str(raw.status),
    // A streaming-only show has `network: null` and a `webChannel` instead. Reading only
    // `network` would leave every Netflix show blank.
    network: str(raw.network?.name) ?? str(raw.webChannel?.name),
  };
}

function readEpisode(raw: RawEpisode): Episode | null {
  // Specials carry `number: null`, and `groupSeasons` drops them too — but bailing here
  // keeps a null out of a field typed as a number.
  if (typeof raw.season !== 'number' || typeof raw.number !== 'number') return null;

  return {
    season: raw.season,
    number: raw.number,
    name: str(raw.name) ?? '',
    airdate: str(raw.airdate),
  };
}

/* ---------------------------------------------------------------------- cache
 *
 * The worker is suspended after ~30s idle and **nothing may assume its in-memory state
 * survives** — an in-memory cache here would appear to work in development and miss
 * constantly in real use.
 *
 * Two stores, for two different lifetimes:
 *   - searches go in `storage.session`: cheap to refetch, and gone when the browser closes
 *   - episode lists go in `storage.local` with a TTL, because that is what makes the
 *     next-episode button instant a week later
 */

interface Cached<T> {
  at: number;
  data: T;
}

async function readCache<T>(
  area: chrome.storage.StorageArea,
  key: string,
  ttlMs: number | null,
): Promise<T | null> {
  try {
    const stored = await area.get(key);
    const value = stored[key] as Cached<T> | undefined;
    if (!value) return null;
    if (ttlMs !== null && Date.now() - value.at > ttlMs) return null;
    return value.data;
  } catch {
    return null;
  }
}

async function writeCache<T>(
  area: chrome.storage.StorageArea,
  key: string,
  data: T,
): Promise<void> {
  try {
    await area.set({ [key]: { at: Date.now(), data } satisfies Cached<T> });
  } catch {
    /* a cache miss is not worth an error */
  }
}

/* ----------------------------------------------------------------------- api */

/** Normalised so "  Breaking   Bad " and "breaking bad" are one cache entry. */
function cacheKey(query: string): string {
  return query.trim().toLowerCase().replace(/\s+/g, ' ');
}

export async function searchShows(query: string): Promise<TvResult<Show[]>> {
  const normalised = cacheKey(query);
  if (normalised.length < 2) return { ok: true, data: [] };

  const key = SEARCH_PREFIX + normalised;
  const cached = await readCache<Show[]>(chrome.storage.session, key, null);
  if (cached) return { ok: true, data: cached };

  const result = await getJson<{ show?: RawShow }[]>(
    `/search/shows?q=${encodeURIComponent(normalised)}`,
  );
  if (!result.ok) return result;

  const shows: Show[] = [];
  for (const hit of Array.isArray(result.data) ? result.data : []) {
    const show = readShow(hit?.show);
    if (show) shows.push(show);
    if (shows.length >= MAX_RESULTS) break;
  }

  await writeCache(chrome.storage.session, key, shows);
  return { ok: true, data: shows };
}

/**
 * Every season of a show, with its real episodes.
 *
 * One request. `/shows/:id/seasons` is deliberately not used — see `groupSeasons` for why
 * its `episodeOrder` cannot be trusted for a show that is still airing.
 */
export async function fetchSeasons(showId: number): Promise<TvResult<Season[]>> {
  if (!Number.isInteger(showId) || showId < 1) {
    return { ok: false, error: 'Not a show.' };
  }

  const key = EPISODES_PREFIX + showId;
  const cached = await readCache<Season[]>(chrome.storage.local, key, EPISODES_TTL_MS);
  if (cached) return { ok: true, data: cached };

  const result = await getJson<RawEpisode[]>(`/shows/${showId}/episodes`);
  if (!result.ok) return result;

  const episodes: Episode[] = [];
  for (const raw of Array.isArray(result.data) ? result.data : []) {
    const episode = readEpisode(raw);
    if (episode) episodes.push(episode);
  }

  const seasons = groupSeasons(episodes);
  await writeCache(chrome.storage.local, key, seasons);
  return { ok: true, data: seasons };
}
