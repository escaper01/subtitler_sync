/**
 * Talking to subtitlecat.
 *
 * Everything upstream goes through here so the politeness rules live in one place: a
 * real User-Agent, a timeout, a response cap, and a hard check that we only ever fetch
 * subtitlecat itself.
 */

export const BASE = 'https://subtitlecat.com';

/** Identify ourselves rather than pretending to be a browser. */
const USER_AGENT = 'SubtitlerExtension/0.1 (+https://github.com/escaper01/subtitler_sync)';

const TIMEOUT_MS = 12_000;

/** A subtitle file is ~150 KB; a page is ~500 KB. Anything past this is not for us. */
const MAX_BYTES = 4 * 1024 * 1024;

export class UpstreamError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/**
 * Resolve a site-relative path against subtitlecat and refuse anything that escapes it.
 *
 * Paths arrive from the client, so this is the SSRF boundary: rather than pattern-match
 * the input, resolve it and require the result to still be on subtitlecat. An absolute
 * URL, a protocol-relative `//evil.com`, or a `..` climb all fail the same way.
 */
export function resolveUpstream(path: string): URL {
  let url: URL;
  try {
    url = new URL(path, `${BASE}/`);
  } catch {
    throw new UpstreamError('Not a usable subtitlecat path', 400);
  }

  if (url.origin !== BASE) {
    throw new UpstreamError('Path does not belong to subtitlecat', 400);
  }
  return url;
}

/** GET a subtitlecat URL as text. Throws `UpstreamError` for anything that isn't a 200. */
export async function fetchText(url: URL): Promise<string> {
  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html,application/xhtml+xml,text/plain,*/*',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    const timedOut = err instanceof Error && err.name === 'TimeoutError';
    throw new UpstreamError(
      timedOut ? 'subtitlecat timed out' : 'Could not reach subtitlecat',
      504,
    );
  }

  if (response.status === 429) {
    throw new UpstreamError('subtitlecat is rate limiting us', 429);
  }
  if (!response.ok) {
    throw new UpstreamError(`subtitlecat responded ${response.status}`, 502);
  }

  // A redirect that leaves the site would mean our resolved URL was not the final one.
  if (new URL(response.url).origin !== BASE) {
    throw new UpstreamError('subtitlecat redirected off-site', 502);
  }

  const declared = Number(response.headers.get('content-length') ?? 0);
  if (declared > MAX_BYTES) {
    throw new UpstreamError('Response too large', 502);
  }

  const text = await response.text();
  if (text.length > MAX_BYTES) {
    throw new UpstreamError('Response too large', 502);
  }
  return text;
}
