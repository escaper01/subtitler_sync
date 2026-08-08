/**
 * Mask credential-ish query parameters.
 *
 * The signed CDN URLs on these sites carry `t=<token>&s=<epoch>&e=<ttl>`, which are
 * short-lived credentials bound to the viewer. Debug output masks them by default so a
 * pasted report cannot leak them.
 */
const SECRET_PARAMS = new Set(['t', 's', 'e', 'token', 'sig', 'signature', 'key', 'hash', 'md5']);

export function maskUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return raw;
  }

  let touched = false;
  for (const name of [...url.searchParams.keys()]) {
    if (!SECRET_PARAMS.has(name.toLowerCase())) continue;
    const value = url.searchParams.get(name) ?? '';
    url.searchParams.set(name, value.length > 6 ? `${value.slice(0, 3)}…[${value.length}]` : '…');
    touched = true;
  }
  return touched ? url.toString() : raw;
}

const MEDIA_EXT = /\.(m3u8|mpd|ts|m4s|mp4|webm|key|vtt|srt)(\?|$)/i;

/** Whether a request looks like streaming media, for the debug log's default filter. */
export function looksLikeMedia(url: string, resourceType: string): boolean {
  return resourceType === 'media' || MEDIA_EXT.test(url);
}
