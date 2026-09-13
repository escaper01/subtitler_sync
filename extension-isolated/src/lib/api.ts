import type {
  ApiErrorCode,
  DonatePrompt,
  Release,
  ReleaseResponse,
  SearchResponse,
  Track,
} from '@/lib/api-types';
import { PAGE_SIZE } from '@/lib/api-types';
import type { RemoteConfig } from '@/lib/subtitlecat/config';
import { DEFAULT_CONFIG } from '@/lib/subtitlecat/config';
import { fetchText, resolveUpstream, UpstreamError } from '@/lib/subtitlecat/http';
import { loadConfig } from '@/lib/subtitlecat/remote';
import type { Detail } from '@/lib/subtitlecat/parse';
import { parseOffscreen } from '@/background/offscreen';

/**
 * The subtitle search client. **Runs in the service worker only.**
 *
 * In `extension/` this file talked to `web/`'s API, and the server did the scraping. Here
 * there is no server: the worker fetches subtitlecat itself, hands the HTML to the
 * offscreen document to parse, and answers the panel with the same shapes the API used
 * to. The panel, the store and the components never noticed the difference — that is the
 * point of keeping `ApiResult<T>` and the message kinds as they were.
 *
 * Still worker-only, for the same reason as before: a content script's `fetch` is subject
 * to the *page's* CORS rules, while the worker's is governed by our host permissions.
 *
 * What went with the server:
 *   - the install id header and the rate limiter it fed. Each user now reaches subtitlecat
 *     from their own address, which is what a browser does anyway.
 *   - the shared cache. What is cached here is per install, in `storage.session`, and
 *     exists so that flipping the second language or paging back does not refetch.
 *   - `apiBase`. There is nothing to point at.
 */

/**
 * A failure, with enough detail for the panel to render it usefully.
 *
 * `code` lets the panel tell a subtitlecat 429 (amber, wait a minute) from a real error
 * (red). There is no `action` button any more: it was server-owned so the server could
 * change where it pointed without an extension update, and there is no server.
 */
export interface ApiFailure {
  ok: false;
  error: string;
  code?: ApiErrorCode;
}

export type ApiResult<T> = { ok: true; data: T } | ApiFailure;

function failure(err: unknown, fallback: string): ApiFailure {
  if (err instanceof UpstreamError) return { ok: false, error: err.message, code: err.code };
  return { ok: false, error: fallback };
}

/* ---------------------------------------------------------------------- cache
 *
 * The worker is suspended after ~30s idle, so nothing may live in its memory. Results go
 * in `storage.session`: cheap to refetch, gone when the browser closes, and bounded by
 * the TTLs below rather than by a size the worker would have to police.
 *
 * A search is stable for days; a release page gains languages as people request
 * translations, so it is kept for less.
 */

const SEARCH_PREFIX = 'sc:search:';
const DETAIL_PREFIX = 'sc:detail:';
const SEARCH_TTL_MS = 6 * 60 * 60 * 1000;
const DETAIL_TTL_MS = 60 * 60 * 1000;

interface Cached<T> {
  at: number;
  data: T;
}

async function readCache<T>(key: string, ttlMs: number): Promise<T | null> {
  try {
    const stored = await chrome.storage.session.get(key);
    const value = stored[key] as Cached<T> | undefined;
    if (!value || Date.now() - value.at > ttlMs) return null;
    return value.data;
  } catch {
    return null;
  }
}

async function writeCache<T>(key: string, data: T): Promise<void> {
  try {
    await chrome.storage.session.set({ [key]: { at: Date.now(), data } satisfies Cached<T> });
  } catch {
    /* a cache miss is not worth an error */
  }
}

/* -------------------------------------------------------------------- parsing */

function sameSelectors(a: object, b: object): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Parse with the remote selectors, and if *those* are what failed, once more with the
 * bundled ones. A typo pushed to `remote/config.json` should cost one extra parse, not
 * every search until it is fixed.
 */
async function parseSearchPage(html: string, config: RemoteConfig): Promise<Release[]> {
  try {
    return await parseOffscreen<Release[]>({
      target: 'offscreen',
      kind: 'parse:search',
      html,
      selectors: config.selectors.search,
    });
  } catch (err) {
    if (sameSelectors(config.selectors.search, DEFAULT_CONFIG.selectors.search)) throw err;
    return parseOffscreen<Release[]>({
      target: 'offscreen',
      kind: 'parse:search',
      html,
      selectors: DEFAULT_CONFIG.selectors.search,
    });
  }
}

async function parseDetailPage(html: string, id: string, config: RemoteConfig): Promise<Detail> {
  try {
    return await parseOffscreen<Detail>({
      target: 'offscreen',
      kind: 'parse:detail',
      html,
      id,
      selectors: config.selectors.detail,
    });
  } catch (err) {
    if (sameSelectors(config.selectors.detail, DEFAULT_CONFIG.selectors.detail)) throw err;
    return parseOffscreen<Detail>({
      target: 'offscreen',
      kind: 'parse:detail',
      html,
      id,
      selectors: DEFAULT_CONFIG.selectors.detail,
    });
  }
}

/* ------------------------------------------------------------------- upstream */

/** Best first: the site's own thumbs-up, then raw download count. */
function byQuality(a: Release, b: Release): number {
  if (a.recommended !== b.recommended) return a.recommended ? -1 : 1;
  return b.downloads - a.downloads;
}

/** Normalised so "  The   Matrix " and "the matrix" are one cache entry. */
function normaliseQuery(query: string): string {
  return query.trim().replace(/\s+/g, ' ');
}

async function search(query: string, config: RemoteConfig): Promise<Release[]> {
  const key = SEARCH_PREFIX + query.toLowerCase();
  const cached = await readCache<Release[]>(key, SEARCH_TTL_MS);
  if (cached) return cached;

  const url = new URL(
    config.searchPath.replace('{query}', encodeURIComponent(query)),
    `${config.base}/`,
  );
  const releases = (await parseSearchPage(await fetchText(config.base, url), config)).sort(byQuality);

  await writeCache(key, releases);
  return releases;
}

async function releaseTracks(path: string, config: RemoteConfig): Promise<ReleaseResponse> {
  const url = resolveUpstream(config.base, path);
  if (!/\.html$/i.test(url.pathname)) {
    throw new UpstreamError('Not a release page.', 'bad_request');
  }

  const id = url.pathname.replace(/^\/+/, '').replace(/\.html$/i, '');
  const key = DETAIL_PREFIX + id;

  let detail = await readCache<Detail>(key, DETAIL_TTL_MS);
  if (!detail) {
    detail = await parseDetailPage(await fetchText(config.base, url), id, config);
    await writeCache(key, detail);
  }

  if (detail.missing) {
    throw new UpstreamError('That release is no longer on subtitlecat.', 'upstream');
  }

  return { releaseId: id, title: detail.title, tracks: detail.tracks };
}

/**
 * Keep only the languages asked for, **in the order they were asked for**.
 *
 * The caller's first language is their primary subtitle track, so returning that one
 * first per release means the panel renders the row it most wants at the top without
 * re-sorting a list it did not build. Costs nothing upstream: a release page is fetched
 * once and already carries every language.
 */
export function filterByLanguages(tracks: readonly Track[], languages: readonly string[]): Track[] {
  const order = new Map(languages.map((code, index) => [code.toLowerCase(), index]));

  return tracks
    .filter((track) => order.has(track.code.toLowerCase()))
    .sort(
      (a, b) => (order.get(a.code.toLowerCase()) ?? 0) - (order.get(b.code.toLowerCase()) ?? 0),
    );
}

/** `en` or `en,de`: one or two codes, as the panel sends them. */
function parseLanguages(lang: string): string[] {
  return lang
    .split(',')
    .map((code) => code.trim())
    .filter((code) => code.length > 0)
    .slice(0, 2);
}

/* ------------------------------------------------------------------------ api */

/**
 * One page of results, with every release on it expanded, so the common case — "find me
 * an English subtitle for this film" — is answered in one go.
 *
 * Expansions run concurrently and failures are swallowed: one release's page 404ing costs
 * that release's languages, not the whole search.
 */
export async function searchSubtitles(
  query: string,
  lang: string,
  page: number,
): Promise<ApiResult<SearchResponse>> {
  const normalised = normaliseQuery(query);
  if (normalised.length < 2) {
    return { ok: false, error: 'Give me at least two characters.', code: 'bad_request' };
  }
  const languages = parseLanguages(lang);
  if (languages.length === 0) {
    return { ok: false, error: 'Pick a language.', code: 'bad_request' };
  }

  const config = await loadConfig();

  let all: Release[];
  try {
    all = await search(normalised, config);
  } catch (err) {
    return failure(err, 'Could not search subtitlecat.');
  }

  const start = (Math.max(1, page) - 1) * PAGE_SIZE;
  const releases = all.slice(start, start + PAGE_SIZE);

  const settled = await Promise.allSettled(
    releases.map((release) => releaseTracks(release.path, config)),
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
    ok: true,
    data: {
      query: normalised,
      languages,
      page: Math.max(1, page),
      pageSize: PAGE_SIZE,
      total: all.length,
      hasMore: start + releases.length < all.length,
      releases,
      tracks,
      expanded,
    },
  };
}

export async function fetchRelease(path: string, lang: string): Promise<ApiResult<ReleaseResponse>> {
  const config = await loadConfig();
  try {
    const release = await releaseTracks(path, config);
    return {
      ok: true,
      data: { ...release, tracks: filterByLanguages(release.tracks, parseLanguages(lang)) },
    };
  } catch (err) {
    return failure(err, 'Could not load that release.');
  }
}

/** Fetch a subtitle's text. The path comes from a `Track` and is re-validated here. */
export async function downloadSubtitle(
  path: string,
): Promise<ApiResult<{ text: string; filename: string }>> {
  const config = await loadConfig();

  try {
    const url = resolveUpstream(config.base, path);
    if (!/\.(srt|vtt)$/i.test(url.pathname)) {
      throw new UpstreamError('Not a subtitle file.', 'bad_request');
    }

    const text = await fetchText(config.base, url);

    // A subtitle should have at least one timestamp arrow in it. Without this check an
    // HTML error page saved as .srt would reach the parser and fail there with something
    // opaque.
    if (!text.includes('-->')) {
      throw new UpstreamError('That file does not look like a subtitle.', 'upstream');
    }

    const filename = safeDecode(url.pathname.split('/').pop() ?? 'subtitle.srt');
    return { ok: true, data: { text, filename } };
  } catch (err) {
    return failure(err, 'Could not download that subtitle.');
  }
}

/**
 * The donation prompt, from the remote config.
 *
 * Everyone gets the same answer. Every string in it is rendered by the panel **inside
 * somebody else's page**, so it was validated on the way in (`lib/donate.ts`) — render it
 * as text and use `color` only as an inline style value.
 */
export async function fetchDonatePrompt(): Promise<ApiResult<DonatePrompt>> {
  return { ok: true, data: (await loadConfig()).donate };
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
