import type { ApiErrorCode } from '@/lib/api-types';

/**
 * Talking to subtitlecat. **Service worker only.**
 *
 * Everything upstream goes through here so the politeness rules live in one place: a
 * timeout, a response cap, and a hard check that we only ever fetch the site itself.
 *
 * No custom User-Agent, unlike the server version. A worker's `fetch` sends the browser's
 * own UA and Chrome will not let an extension override it from here; the request looks
 * like what it is — this user's browser asking for a page — which is also the reason a
 * Cloudflare front does not challenge it.
 */

const TIMEOUT_MS = 12_000;

/** A subtitle file is ~150 KB; a page is ~500 KB. Anything past this is not for us. */
const MAX_BYTES = 4 * 1024 * 1024;

export class UpstreamError extends Error {
  constructor(
    message: string,
    readonly code: ApiErrorCode,
  ) {
    super(message);
  }
}

/**
 * Resolve a site-relative path against the site and refuse anything that escapes it.
 *
 * Paths come out of parsed HTML and back from the panel, so this is the boundary: rather
 * than pattern-match the input, resolve it and require the result to still be on the
 * site. An absolute URL, a protocol-relative `//evil.com`, or a `..` climb all fail the
 * same way.
 */
export function resolveUpstream(base: string, path: string): URL {
  let url: URL;
  try {
    url = new URL(path, `${base}/`);
  } catch {
    throw new UpstreamError('Not a usable subtitlecat path', 'bad_request');
  }

  if (url.origin !== base) {
    throw new UpstreamError('Path does not belong to subtitlecat', 'bad_request');
  }
  return url;
}

/** GET a subtitlecat URL as text. Throws `UpstreamError` for anything that isn't a 200. */
export async function fetchText(base: string, url: URL): Promise<string> {
  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        Accept: 'text/html,application/xhtml+xml,text/plain,*/*',
      },
      redirect: 'follow',
      credentials: 'omit',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    const timedOut = err instanceof Error && err.name === 'TimeoutError';
    throw new UpstreamError(
      timedOut ? 'subtitlecat timed out.' : 'Could not reach subtitlecat.',
      'upstream',
    );
  }

  if (response.status === 429) {
    throw new UpstreamError('subtitlecat is rate limiting you. Try again shortly.', 'rate_limited');
  }
  if (!response.ok) {
    throw new UpstreamError(`subtitlecat responded ${response.status}.`, 'upstream');
  }

  // A redirect that leaves the site would mean our resolved URL was not the final one.
  if (new URL(response.url).origin !== base) {
    throw new UpstreamError('subtitlecat redirected off-site.', 'upstream');
  }

  const declared = Number(response.headers.get('content-length') ?? 0);
  if (declared > MAX_BYTES) {
    throw new UpstreamError('That page is too large.', 'upstream');
  }

  const text = await response.text();
  if (text.length > MAX_BYTES) {
    throw new UpstreamError('That page is too large.', 'upstream');
  }
  return text;
}
