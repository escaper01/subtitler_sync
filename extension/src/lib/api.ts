import type {
  ApiError,
  ApiErrorCode,
  DonatePrompt,
  ReleaseResponse,
  SearchResponse,
} from '@/lib/api-types';
import { installId } from '@/background/install';

/**
 * The subtitle search API client. **Runs in the service worker only.**
 *
 * Not in the content script, and not in the panel: an MV3 content script's `fetch` is
 * subject to the page's CORS rules, while the worker's is governed by the extension's host
 * permissions. Importing this from the panel produces code that works on your test site and
 * fails on somebody else's. Everything therefore goes panel → worker → API.
 *
 * **Nothing here authenticates.** There is no licence key and no session; the API is open
 * and rate-limited instead. The one header that still matters is `X-Subtitler-Install`,
 * which is what the server's limiter counts against — see `background/install.ts`.
 */

/**
 * Where the API lives.
 *
 * Points at the `web/` container, because nothing is deployed yet. That container is
 * always up (`restart: unless-stopped` in web/docker-compose.yml), so this works without
 * anyone having started a dev server first.
 *
 * **Port 47821, not 3000.** A high, unremarkable number, because 3000 is the first port
 * every other project on the machine takes — and a clash there is not a failure to
 * connect, it is the extension quietly talking to somebody else's server and reporting
 * whatever that one says. Change it here, in `extension-lite/src/lib/api.ts` (this file is
 * deliberately not synced between the two builds), and in docker-compose.yml together.
 *
 * Override without a rebuild by setting `apiBase` in `chrome.storage.sync`:
 *
 *   chrome.storage.sync.set({ apiBase: 'https://subtitler.example.com' })
 */
const DEFAULT_API_BASE = 'http://localhost:47821';

const TIMEOUT_MS = 20_000;

/**
 * A failure, with enough detail for the panel to offer a button rather than red text.
 *
 * `code` and `action` are optional and come straight from the server: an older build of
 * this extension simply ignores them, and where a button points can change without
 * shipping an update through Web Store review.
 */
export interface ApiFailure {
  ok: false;
  error: string;
  code?: ApiErrorCode;
  action?: { label: string; url: string };
}

export type ApiResult<T> = { ok: true; data: T } | ApiFailure;

/**
 * Read a failed response into an `ApiFailure`.
 *
 * One function because there are two fetch call sites — `request()` and the hand-rolled
 * one in `downloadSubtitle()` — and they drifted apart the last time this was inline.
 */
async function readError(response: Response): Promise<ApiFailure> {
  const body = (await response.json().catch(() => null)) as ApiError | null;

  // A response that is not our JSON means something else answered: a captive portal, a
  // proxy, a misconfigured apiBase.
  if (!body || typeof body.error !== 'string') {
    return { ok: false, error: `The subtitle service returned ${response.status}.` };
  }

  return { ok: false, error: body.error, code: body.code, action: body.action };
}

export async function apiBase(): Promise<string> {
  try {
    const stored = await chrome.storage.sync.get('apiBase');
    const value = stored.apiBase;
    return typeof value === 'string' && value.length > 0 ? value.replace(/\/+$/, '') : DEFAULT_API_BASE;
  } catch {
    return DEFAULT_API_BASE;
  }
}

/**
 * Which installation is asking.
 *
 * A header rather than a cookie: the worker's `fetch` is not attached to any browsing
 * context, and headers keep the API's CORS wide open *without* credentials — which is what
 * makes `Access-Control-Allow-Origin: *` safe there.
 *
 * This name specifically, because the API allowlists it in its preflight. It goes on
 * **every** call that can be rate-limited, which is search, release and download alike —
 * omitting it does not evade the limiter, it just puts this user in the shared anonymous
 * bucket alongside everyone else who omitted it.
 */
async function callerHeaders(): Promise<Record<string, string>> {
  const install = await installId();
  return install ? { 'X-Subtitler-Install': install } : {};
}

/**
 * One request. Every failure is turned into a sentence a user could act on, because this
 * is the only layer that knows whether the problem was the network, us, or upstream.
 */
async function request<T>(path: string, params: Record<string, string>): Promise<ApiResult<T>> {
  const url = new URL(path, `${await apiBase()}/`);
  for (const [name, value] of Object.entries(params)) {
    if (value) url.searchParams.set(name, value);
  }

  let response: Response;
  try {
    response = await fetch(url, {
      headers: await callerHeaders(),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    const timedOut = err instanceof Error && err.name === 'TimeoutError';
    return {
      ok: false,
      error: timedOut ? 'The search timed out.' : 'Could not reach the subtitle service.',
    };
  }

  if (!response.ok) return readError(response);

  try {
    return { ok: true, data: (await response.json()) as T };
  } catch {
    return { ok: false, error: 'The subtitle service sent something unreadable.' };
  }
}

export async function searchSubtitles(
  query: string,
  lang: string,
  page: number,
): Promise<ApiResult<SearchResponse>> {
  return request<SearchResponse>('api/search', { q: query, lang, page: String(page) });
}

export async function fetchRelease(
  path: string,
  lang: string,
): Promise<ApiResult<ReleaseResponse>> {
  return request<ReleaseResponse>('api/release', { path, lang });
}

/**
 * The donation prompt, if the dashboard has one switched on.
 *
 * Everyone gets the same answer — there are no subscribers to exempt. Every string it
 * returns is admin-supplied and gets rendered by the panel **inside somebody else's page**,
 * so render it as text and use `color` only as an inline style value; the server has
 * validated it as `#rrggbb` precisely so that it can be.
 */
export async function fetchDonatePrompt(): Promise<ApiResult<DonatePrompt>> {
  return request<DonatePrompt>('api/donate', {});
}

/** Fetch a subtitle's text. Returns the text itself, not JSON. */
export async function downloadSubtitle(
  path: string,
): Promise<ApiResult<{ text: string; filename: string }>> {
  const url = new URL('api/download', `${await apiBase()}/`);
  url.searchParams.set('path', path);

  let response: Response;
  try {
    // The header goes here too. This fetch is hand-rolled rather than going through
    // `request<T>()` because the response is text, not JSON — which makes it the easy one
    // to forget whenever anything about the headers changes. It has been missed before.
    response = await fetch(url, {
      headers: await callerHeaders(),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    return { ok: false, error: 'Could not download that subtitle.' };
  }

  // The same reader as `request<T>()`, so a rate-limited download says "slow down a
  // moment" rather than "could not download that subtitle (429)".
  if (!response.ok) return readError(response);

  const header = response.headers.get('X-Subtitle-Filename');
  const filename = header ? safeDecode(header) : 'subtitle.srt';

  return { ok: true, data: { text: await response.text(), filename } };
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
