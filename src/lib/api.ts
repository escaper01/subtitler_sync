import type {
  ApiErrorCode,
  DonatePrompt,
  Release,
  ReleaseResponse,
  SearchResponse,
  SourceStatus,
  Track,
} from '@/lib/api-types';
import { PAGE_SIZE } from '@/lib/api-types';
import { SITE_CONFIG as config } from '@/lib/subtitlecat/config';
import { fetchText, resolveUpstream, UpstreamError } from '@/lib/subtitlecat/http';
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
 *     exists so that paging back does not refetch.
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

function parseSearchPage(html: string): Promise<Release[]> {
  return parseOffscreen<Release[]>({
    target: 'offscreen',
    kind: 'parse:search',
    html,
    selectors: config.selectors.search,
  });
}

function parseDetailPage(html: string, id: string): Promise<Detail> {
  return parseOffscreen<Detail>({
    target: 'offscreen',
    kind: 'parse:detail',
    html,
    id,
    selectors: config.selectors.detail,
  });
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

async function search(query: string): Promise<Release[]> {
  const key = SEARCH_PREFIX + query.toLowerCase();
  const cached = await readCache<Release[]>(key, SEARCH_TTL_MS);
  if (cached) return cached;

  const url = new URL(
    config.searchPath.replace('{query}', encodeURIComponent(query)),
    `${config.base}/`,
  );
  const releases = (await parseSearchPage(await fetchText(config.base, url))).sort(byQuality);

  await writeCache(key, releases);
  return releases;
}

async function releaseTracks(path: string): Promise<ReleaseResponse> {
  const url = resolveUpstream(config.base, path);
  if (!/\.html$/i.test(url.pathname)) {
    throw new UpstreamError('Not a release page.', 'bad_request');
  }

  const id = url.pathname.replace(/^\/+/, '').replace(/\.html$/i, '');
  const key = DETAIL_PREFIX + id;

  let detail = await readCache<Detail>(key, DETAIL_TTL_MS);
  if (!detail) {
    detail = await parseDetailPage(await fetchText(config.base, url), id);
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

  let all: Release[];
  try {
    all = await search(normalised);
  } catch (err) {
    return failure(err, 'Could not search subtitlecat.');
  }

  const start = (Math.max(1, page) - 1) * PAGE_SIZE;
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
  try {
    const release = await releaseTracks(path);
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
 * The donation prompt, from the bundled config (off unless a build enables it).
 *
 * Everyone gets the same answer. Every string in it is rendered by the panel **inside
 * somebody else's page**, so it was validated on the way in (`lib/donate.ts`) — render it
 * as text and use `color` only as an inline style value.
 */
export function fetchDonatePrompt(): Promise<ApiResult<DonatePrompt>> {
  return Promise.resolve({ ok: true, data: config.donate });
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/* --------------------------------------------------------------- source status */

const STATUS_KEY = 'sc:status';
const STATUS_TTL_MS = 24 * 60 * 60 * 1000;
/** A title that has always had releases, in more than one language. */
const PROBE_QUERY = 'the matrix';
/** How many releases to look through for one with a downloadable file. */
const PROBE_RELEASES = 3;

/**
 * An end-to-end test of the source: search, open a release, download a subtitle and see
 * that it looks like one. Bypasses the caches, because the point is to ask the site.
 *
 * Costs at most one search, three release pages and one file — once a day.
 */
async function probeSource(): Promise<SourceStatus> {
  const checkedAt = Date.now();
  try {
    const url = new URL(config.searchPath.replace('{query}', encodeURIComponent(PROBE_QUERY)), `${config.base}/`);
    const releases = await parseSearchPage(await fetchText(config.base, url));
    if (releases.length === 0) {
      return { state: 'down', checkedAt, detail: 'The search page returned no results. The site may have changed its layout.' };
    }

    for (const release of releases.slice(0, PROBE_RELEASES)) {
      const resolved = resolveUpstream(config.base, release.path);
      const id = resolved.pathname.replace(/^\/+/, '').replace(/\.html$/i, '');
      const detail = await parseDetailPage(await fetchText(config.base, resolved), id);
      const track = detail.missing ? undefined : detail.tracks[0];
      if (!track) continue;

      const file = await downloadSubtitle(track.path);
      if (file.ok) return { state: 'ok', checkedAt };
      if (file.code === 'rate_limited') return { state: 'unknown', checkedAt, detail: file.error };
      return { state: 'down', checkedAt, detail: file.error };
    }

    return { state: 'down', checkedAt, detail: 'No release page offered a downloadable subtitle.' };
  } catch (err) {
    if (err instanceof UpstreamError && err.code === 'rate_limited') {
      return { state: 'unknown', checkedAt, detail: err.message };
    }
    return {
      state: 'down',
      checkedAt,
      detail: err instanceof Error ? err.message : 'The subtitle site could not be reached.',
    };
  }
}

let probing: Promise<SourceStatus> | null = null;

/**
 * The source's status: the stored answer if it is under a day old, otherwise a fresh test.
 *
 * Stored in `storage.local`, not worker memory, which is suspended after ~30s idle. Offline
 * is not "the site is down": a probe that fails because the browser has no network is not
 * saved, so it is retried the next time the Find tab opens rather than for a day.
 */
export async function getSourceStatus(): Promise<SourceStatus> {
  try {
    const stored = (await chrome.storage.local.get(STATUS_KEY))[STATUS_KEY] as SourceStatus | undefined;
    if (stored && Date.now() - stored.checkedAt < STATUS_TTL_MS) return stored;
  } catch {
    /* fall through to a fresh test */
  }

  probing ??= probeSource()
    .then(async (status) => {
      const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
      if (status.state !== 'unknown' && !offline) {
        try {
          await chrome.storage.local.set({ [STATUS_KEY]: status });
        } catch {
          /* not worth an error */
        }
      }
      return offline ? { ...status, state: 'unknown' as const, detail: 'You appear to be offline.' } : status;
    })
    .finally(() => {
      probing = null;
    });
  return probing;
}
