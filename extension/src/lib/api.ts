import type { ReleaseResponse, SearchResponse } from '@/lib/api-types';
import { loadAuth } from '@/background/auth';

/**
 * The subtitle search API client. **Runs in the service worker only.**
 *
 * Not in the content script, and not in the panel: an MV3 content script's `fetch` is
 * subject to the page's CORS rules, while the worker's is governed by the extension's host
 * permissions. Everything therefore goes panel → worker → API, which is also where a
 * licence key would be attached once there is one.
 */

/**
 * Where the API lives.
 *
 * Points at the local `web/` dev server, because nothing is deployed yet. Override without
 * a rebuild by setting `apiBase` in `chrome.storage.sync`:
 *
 *   chrome.storage.sync.set({ apiBase: 'https://subtitler.example.com' })
 */
const DEFAULT_API_BASE = 'http://localhost:3000';

const TIMEOUT_MS = 20_000;

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: string };

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
 * The signed-in user's credential, if there is one.
 *
 * A header rather than a cookie: the worker's `fetch` is not attached to any browsing
 * context, and a header keeps the API's CORS wide open without credentials — which is what
 * makes `Access-Control-Allow-Origin: *` safe there.
 *
 * `X-Subtitler-Key` specifically, because the API already allowlists that name in its
 * preflight; using `Authorization` would mean changing the server's CORS too.
 */
async function authHeaders(): Promise<Record<string, string>> {
  const auth = await loadAuth();
  return auth ? { 'X-Subtitler-Key': auth.token } : {};
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
      headers: await authHeaders(),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    const timedOut = err instanceof Error && err.name === 'TimeoutError';
    return {
      ok: false,
      error: timedOut ? 'The search timed out.' : 'Could not reach the subtitle service.',
    };
  }

  if (!response.ok) {
    // The API reports its failures as { error }; anything else means it is not our API
    // answering — a captive portal, a proxy, a misconfigured apiBase.
    const message = await response
      .json()
      .then((body: unknown) =>
        body && typeof body === 'object' && 'error' in body ? String(body.error) : null,
      )
      .catch(() => null);

    return { ok: false, error: message ?? `The subtitle service returned ${response.status}.` };
  }

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
    // to forget when anything about auth changes.
    response = await fetch(url, {
      headers: await authHeaders(),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    return { ok: false, error: 'Could not download that subtitle.' };
  }

  if (!response.ok) {
    return { ok: false, error: `Could not download that subtitle (${response.status}).` };
  }

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
