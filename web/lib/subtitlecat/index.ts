import type { Release, ReleaseResponse, SearchResponse, Track } from '@/lib/api-types';
import { PAGE_SIZE } from '@/lib/api-types';
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

/**
 * Every release on a page is expanded, so a page is also the unit of upstream work: one
 * search fetch plus `PAGE_SIZE` detail fetches, no matter how many releases matched —
 * **or how many languages were asked for**. A release page carries every language, so the
 * language filter is post-processing over data already fetched and already cached.
 */
export const EXPAND_COUNT = PAGE_SIZE;

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
 * One page of results, with every release on it expanded, so the common case — "find me
 * an English subtitle for this film" — is answered in a single round trip.
 *
 * Expansions run concurrently and failures are swallowed: one release's page 404ing should
 * cost that release's languages, not the whole search.
 */
export async function searchExpanded(
  query: string,
  languages: readonly string[],
  page: number,
): Promise<SearchResponse> {
  const all = await search(query);

  const start = (page - 1) * PAGE_SIZE;
  const releases = all.slice(start, start + PAGE_SIZE);

  const settled = await Promise.allSettled(
    releases.map((release) => releaseTracks(release.path)),
  );

  const tracks: Track[] = [];
  const expanded: string[] = [];

  settled.forEach((result, index) => {
    const release = releases[index];
    if (!release || result.status !== 'fulfilled') return;

    expanded.push(release.id);
    tracks.push(...filterByLanguages(result.value.tracks, languages));
  });

  return {
    query: query.trim(),
    languages: [...languages],
    page,
    pageSize: PAGE_SIZE,
    total: all.length,
    hasMore: start + releases.length < all.length,
    releases,
    tracks,
    expanded,
  };
}

/**
 * Keep only the languages asked for, **in the order they were asked for**.
 *
 * The ordering is the useful half. The caller's first language is their primary subtitle
 * track, so returning that one first per release means the client renders the row it is
 * most likely to want at the top without re-sorting a list it did not build.
 *
 * Costs nothing upstream: `releaseTracks` fetches a release page once and it already
 * contains every language. This filter runs over data that is in hand either way, which is
 * why asking for two languages is the same amount of work as asking for one.
 */
export function filterByLanguages(
  tracks: readonly Track[],
  languages: readonly string[],
): Track[] {
  const order = new Map(languages.map((code, index) => [code.toLowerCase(), index]));

  return tracks
    .filter((track) => order.has(track.code.toLowerCase()))
    .sort(
      (a, b) =>
        (order.get(a.code.toLowerCase()) ?? 0) - (order.get(b.code.toLowerCase()) ?? 0),
    );
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
