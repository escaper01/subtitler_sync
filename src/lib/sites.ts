/**
 * The site allowlist.
 *
 * The content script is injected into every frame of every page (see below), so without a
 * gate the panel would appear over any video anywhere on the web. Nothing runs unless the
 * *top-level* page's host is on this list.
 *
 * Matching is against the top frame's host, never the frame's own host. The film plays
 * inside a cross-origin embed iframe whose domain rotates and is not something a user
 * would think to allow — `hdfilme.to` is the site they visit, `dr0pstream.com` is an
 * implementation detail of it. Gating on the top host means allowing the site the user
 * knows about also covers whatever it embeds.
 *
 * This is also why the manifest still matches `<all_urls>`: an allowlist expressed as
 * manifest `matches` would exclude the embed frame, which is the one frame that actually
 * contains the video.
 */

const SITES_KEY = 'sites';

/**
 * Allowed out of the box. Users add and remove from the popup, and the stored list
 * replaces this wholesale once they do.
 *
 * `localhost` is here for the offline test harness (`test/local.html`, see CLAUDE.md);
 * without it, `npm run dev` looks exactly like a detection bug.
 */
export const DEFAULT_ALLOWED_SITES: readonly string[] = [
  'hdfilme.to',
  'serienstream.to',
  'aniworld.to',
  'einschalten.in',
  'playmogo.com',
  'kinoger.com',
  'megakino14.com',
  'moflix-stream.xyz',
  'media.ccc.de',
  'localhost',
];

/** A hostname label, or a dotted host, or a bare `localhost` / IP literal. */
const HOST_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/;

/**
 * Turn whatever the user typed — a pasted URL, a bare domain, `*.example.com` — into a
 * plain host, or null if it can't be one.
 *
 * A leading `www.` is stripped: nobody means "only the www subdomain", and matching is by
 * suffix anyway, so `example.com` already covers `www.example.com`.
 */
export function normalizeDomain(input: string): string | null {
  let value = input.trim().toLowerCase();
  if (!value) return null;

  if (value.includes('://')) {
    try {
      value = new URL(value).hostname;
    } catch {
      return null;
    }
  } else {
    value = value.split('/')[0] ?? '';
    // Strip a port, but leave a bracketed IPv6 literal alone.
    if (!value.startsWith('[')) value = value.split(':')[0] ?? '';
  }

  value = value.replace(/^\*\./, '').replace(/^\./, '').replace(/\.$/, '');
  if (value.startsWith('www.')) value = value.slice(4);

  if (!value || !HOST_RE.test(value)) return null;
  return value;
}

/** True when `host` is the rule's domain or a subdomain of it. */
export function hostMatches(host: string, rule: string): boolean {
  const h = host.toLowerCase();
  return h === rule || h.endsWith(`.${rule}`);
}

export function isAllowed(host: string | null | undefined, sites: readonly string[]): boolean {
  if (!host) return false;
  return sites.some((rule) => hostMatches(host, rule));
}

/* -------------------------------------------------------------------- storage */

/**
 * The list lives in `storage.sync`: it's tiny, and which sites you watch films on should
 * follow you between machines.
 */
export async function loadSites(): Promise<string[]> {
  try {
    const stored = await chrome.storage.sync.get(SITES_KEY);
    const value = stored[SITES_KEY] as unknown;
    if (!Array.isArray(value)) return [...DEFAULT_ALLOWED_SITES];
    return value.filter((item): item is string => typeof item === 'string');
  } catch {
    return [...DEFAULT_ALLOWED_SITES];
  }
}

export async function saveSites(sites: readonly string[]): Promise<void> {
  await chrome.storage.sync.set({ [SITES_KEY]: [...sites] });
}

/** Add a site. Returns the new list, unchanged if the input wasn't a usable host. */
export async function allowSite(input: string): Promise<string[]> {
  const domain = normalizeDomain(input);
  const sites = await loadSites();
  if (!domain || sites.includes(domain)) return sites;

  const next = [...sites, domain].sort();
  await saveSites(next);
  return next;
}

/** Remove a site, along with any rule that only differs by `www.`/case. */
export async function blockSite(input: string): Promise<string[]> {
  const domain = normalizeDomain(input);
  const sites = await loadSites();
  if (!domain) return sites;

  const next = sites.filter((rule) => normalizeDomain(rule) !== domain);
  if (next.length === sites.length) return sites;

  await saveSites(next);
  return next;
}

/**
 * Stop running on a host: drop every rule that covers it, not just an exact match.
 *
 * Switching a site off has to mean it, so a `kinoger.com` rule must go when the user turns
 * the switch off on `www.kinoger.com` — otherwise the switch would flick straight back on.
 */
export async function blockHost(host: string): Promise<string[]> {
  const sites = await loadSites();
  const next = sites.filter((rule) => !hostMatches(host, rule));
  if (next.length === sites.length) return sites;

  await saveSites(next);
  return next;
}

/** Subscribe to changes made in any other context (the popup, a synced machine). */
export function onSitesChanged(handler: (sites: string[]) => void): () => void {
  const listener = (
    changes: Record<string, chrome.storage.StorageChange>,
    area: string,
  ): void => {
    if (area !== 'sync' || !(SITES_KEY in changes)) return;
    const value = changes[SITES_KEY]?.newValue as unknown;
    handler(Array.isArray(value) ? (value as string[]) : [...DEFAULT_ALLOWED_SITES]);
  };

  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}

/* ------------------------------------------------------------------ top host */

/**
 * The host of the tab's top-level page, as seen from *this* frame.
 *
 * `ancestorOrigins` gives a child frame the origin chain up to the top without any
 * messaging, which matters because this runs at `document_start` in every frame on the
 * page. It comes back null only for an opaque (sandboxed) ancestor; the caller then falls
 * back to asking the service worker, which can read the tab URL.
 */
export function topHostname(): string | null {
  try {
    if (window.top === window) return location.hostname || null;

    const chain = location.ancestorOrigins;
    const top = chain && chain.length > 0 ? chain[chain.length - 1] : null;
    if (top && top !== 'null') return new URL(top).hostname || null;
  } catch {
    /* cross-origin access or a malformed origin — fall through */
  }
  return null;
}

/** Host of a full URL, for the popup and the background. */
export function hostOf(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname || null;
  } catch {
    return null;
  }
}
