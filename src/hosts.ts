/**
 * Known hosts, for documentation and diagnostics only.
 *
 * The manifest deliberately matches `<all_urls>` because both the site domain and the
 * embed host rotate. Nothing in the extension's behaviour keys off this list — it is used
 * to annotate the debug frame tree ("this looks like a known player host") and would be
 * the starting point for a tightened allowlist if this were ever submitted to the Web Store.
 */

/** Front-end sites the user browses. */
export const SITE_HOSTS = ['hdfilme.win', 'hdfilme.best', 'hdfilme.cx'] as const;

/**
 * Hosts in the player iframe chain. Observed on hdfilme.win:
 *
 *   hdfilme.win  →  <iframe id="_player" src="//dropload.co/embed-<id>.html">
 *                →  dr0pstream.com/embed-<id>.html  →  <video src="blob:…">
 *
 * The same `<id>` appears in both URLs, so dropload.co almost certainly redirects to
 * dr0pstream.com — one iframe that navigates, rather than two nested ones. Either way
 * `all_frames: true` covers it, and the outer iframe carries `allowfullscreen`, so
 * fullscreen propagates to the frame that owns the video (and therefore to our overlay).
 *
 * Useful for debugging: the embed URL loads standalone in a tab, which isolates player
 * problems from iframe problems.
 */
export const EMBED_HOSTS = ['dropload.co', 'dr0pstream.com', 'dropstream.com'] as const;

/** CDN hosts that serve the HLS manifest and segments. Never fetched by this extension. */
export const CDN_HOSTS = ['dropcdn.io'] as const;

const ALL = [...SITE_HOSTS, ...EMBED_HOSTS, ...CDN_HOSTS];

export type HostKind = 'site' | 'embed' | 'cdn' | 'unknown';

/** Best-effort classification of a URL's host, for debug display. */
export function classifyHost(url: string): HostKind {
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    return 'unknown';
  }
  const match = (list: readonly string[]) =>
    list.some((h) => host === h || host.endsWith(`.${h}`));

  if (match(SITE_HOSTS)) return 'site';
  if (match(EMBED_HOSTS)) return 'embed';
  if (match(CDN_HOSTS)) return 'cdn';
  return 'unknown';
}

export function isKnownHost(url: string): boolean {
  return classifyHost(url) !== 'unknown' && ALL.length > 0;
}
