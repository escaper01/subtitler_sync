import type { Release, ReleaseResponse, SearchResponse, Track } from '@/lib/api-types';
import { TtlCache } from '@/lib/cache';
import { BASE, fetchText, resolveUpstream, UpstreamError } from '@/lib/subtitlecat/http';
import { parseDetail, parseSearch } from '@/lib/subtitlecat/parse';

/**
 * The subtitlecat client: search, expand a release, fetch a file.
 *
 * Results are cached longer than detail pages because a search for a given film is
 * stable for days, while a release page gains languages as people request translations.
 */

const searchCache = new TtlCache<Release[]>(6 * 60 * 60 * 1000);
const detailCache = new TtlCache<{ title: string; tracks: Track[]; missing: boolean }>(
  60 * 60 * 1000,
);

/** How many of the top releases to expand eagerly on a search. */
export const EXPAND_COUNT = 5;

/** Best first: the site's own thumbs-up, then raw download count. */
function byQuality(a: Release, b: Release): number {
  if (a.recommended !== b.recommended) return a.recommended ? -1 : 1;
  return b.downloads - a.downloads;
}

export async function search(query: string): Promise<Release[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  return searchCache.wrap(trimmed.toLowerCase(), async () => {
    const url = new URL('/index.php', BASE);
    url.searchParams.set('search', trimmed);

    const releases = parseSearch(await fetchText(url));
    return releases.sort(byQuality);
  });
}

export async function releaseTracks(path: string): Promise<ReleaseResponse> {
  const url = resolveUpstream(path);
  if (!/\.html$/i.test(url.pathname)) {
    throw new UpstreamError('Not a release page', 400);
  }

  const id = url.pathname.replace(/^\/+/, '').replace(/\.html$/i, '');
  const detail = await detailCache.wrap(id, async () =>
    parseDetail(await fetchText(url), id),
  );

  if (detail.missing) {
    throw new UpstreamError('That release is no longer on subtitlecat', 404);
  }

  return { releaseId: id, title: detail.title, tracks: detail.tracks };
}

/**
 * Search, then expand the best few releases so the common case — "find me an English
 * subtitle for this film" — is answered in one round trip.
 *
 * Expansions run concurrently and failures are swallowed: one release's page 404ing
 * should cost that release's languages, not the whole search.
 */
export async function searchExpanded(
  query: string,
  languages: readonly string[],
): Promise<SearchResponse> {
  const releases = await search(query);
  const top = releases.slice(0, EXPAND_COUNT);

  const settled = await Promise.allSettled(top.map((release) => releaseTracks(release.path)));

  const tracks: Track[] = [];
  const expanded: string[] = [];

  settled.forEach((result, index) => {
    const release = top[index];
    if (!release || result.status !== 'fulfilled') return;

    expanded.push(release.id);
    tracks.push(...filterByLanguage(result.value.tracks, languages));
  });

  return { query: query.trim(), releases, tracks, expanded };
}

/**
 * Keep only the languages the user asked for.
 *
 * An empty list means no filter rather than no results — the API stays useful to a caller
 * that has no preferences, and the extension always sends at least English.
 */
export function filterByLanguage(
  tracks: readonly Track[],
  languages: readonly string[],
): Track[] {
  if (languages.length === 0) return [...tracks];

  const wanted = new Set(languages.map((code) => code.toLowerCase()));
  return tracks.filter((track) => wanted.has(track.code.toLowerCase()));
}

/** Fetch a `.srt`'s text. The path comes from a `Track`, and is re-validated upstream. */
export async function downloadSubtitle(path: string): Promise<{ text: string; filename: string }> {
  const url = resolveUpstream(path);
  if (!/\.(srt|vtt)$/i.test(url.pathname)) {
    throw new UpstreamError('Not a subtitle file', 400);
  }

  const text = await fetchText(url);

  // A subtitle should have at least one timestamp arrow in it. Without this check an HTML
  // error page saved as .srt would reach the parser and fail there with something opaque.
  if (!text.includes('-->')) {
    throw new UpstreamError('That file does not look like a subtitle', 502);
  }

  const filename = decodeURIComponent(url.pathname.split('/').pop() ?? 'subtitle.srt');
  return { text, filename };
}
