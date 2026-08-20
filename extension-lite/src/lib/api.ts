import type { ApiError, ApiErrorCode, DonatePrompt } from '@/lib/api-types';
import { installId } from '@/background/install';

/**
 * The API client. **Runs in the service worker only.**
 *
 * There is one endpoint: `/api/donate`. This build has no subtitle search, so it never asks
 * the server for anything else — loading a file, syncing it, styling it and the site
 * allowlist are all entirely local.
 *
 * The worker-only rule still holds even for one call: a content script's `fetch` obeys the
 * *page's* CORS rules, while the worker's obeys the extension's host permissions. Importing
 * this from the panel produces code that works on your test site and fails on somebody
 * else's.
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

export interface ApiFailure {
  ok: false;
  error: string;
  code?: ApiErrorCode;
  action?: { label: string; url: string };
}

export type ApiResult<T> = { ok: true; data: T } | ApiFailure;

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
 * Kept even though nothing here is rate limited, so the server sees one consistent shape
 * of request from both builds — and so that a future endpoint added to this build is
 * countable from the day it ships rather than the day somebody remembers the header.
 */
async function callerHeaders(): Promise<Record<string, string>> {
  const install = await installId();
  return install ? { 'X-Subtitler-Install': install } : {};
}

/**
 * The donation prompt, if the dashboard has one switched on.
 *
 * Every string it returns is admin-supplied and gets rendered by the panel **inside
 * somebody else's page**, so render it as text and use `color` only as an inline style
 * value; the server has validated it as `#rrggbb` precisely so that it can be.
 */
export async function fetchDonatePrompt(): Promise<ApiResult<DonatePrompt>> {
  const url = new URL('api/donate', `${await apiBase()}/`);

  let response: Response;
  try {
    response = await fetch(url, {
      headers: await callerHeaders(),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    // Silent by design: a missing donation banner is not something to interrupt somebody's
    // film for. `PanelBanner` renders nothing on a failure.
    return { ok: false, error: 'Could not reach the server.' };
  }

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as ApiError | null;
    return typeof body?.error === 'string'
      ? { ok: false, error: body.error, code: body.code, action: body.action }
      : { ok: false, error: `The server returned ${response.status}.` };
  }

  try {
    return { ok: true, data: (await response.json()) as DonatePrompt };
  } catch {
    return { ok: false, error: 'The server sent something unreadable.' };
  }
}
