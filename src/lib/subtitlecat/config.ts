import type { DonatePrompt } from '@/lib/api-types';
import { NO_PROMPT, readDonate } from '@/lib/donate';

/**
 * What can change without shipping a new build.
 *
 * `extension/` parsed subtitlecat on a server so that a change to the site's markup was a
 * deploy rather than an extension update every user has to install. This build has no
 * server, so the same property comes from the next cheapest thing: the selectors the
 * parser uses are **data**, fetched from a JSON file in this repository, with the copy
 * below bundled as the fallback. A renamed class is an edit to `remote/config.json`; a
 * redesigned page is still a new build, and there is no way around that.
 *
 * The donation prompt rides along in the same file for the same reason — it used to be
 * rows in a dashboard, and "edit a file, push" is the dashboard now.
 *
 * Everything in here is pure. Fetching and caching live in `remote.ts`, which is
 * worker-only; parsing lives in `parse.ts`, which runs in the offscreen document.
 */

/**
 * How the search results table is read. Every selector is relative to one row.
 *
 * As of writing the row is:
 *   td0  <a href="subs/45/Title.html">Title</a> (translated from English)
 *   td1  a thumbs-up marker, or nothing
 *   td2  size
 *   td3  "N downloads"
 *   td4  "N languages"
 */
export interface SearchSelectors {
  /** One result row. Relative to the document. */
  row: string;
  /** The release link, whose `href` is the detail page. */
  link: string;
  /** The element whose text carries "(translated from X)". */
  source: string;
  /** Present when the site marked the upload with a thumbs-up. */
  recommended: string;
  size: string;
  downloads: string;
  languages: string;
}

/**
 * How a release page is read. `heading` is relative to the document, everything else to
 * one `block` — one language each, holding either a Download link to an existing `.srt`
 * or a Translate button for one the site would generate on demand.
 */
export interface DetailSelectors {
  heading: string;
  /** Stripped off the front of the heading to leave the release name. */
  headingPrefix: string;
  /** A heading containing this marks a release that no longer exists. */
  missingMarker: string;
  block: string;
  /** The download link. Only anchors whose `href` ends in `.srt` are usable. */
  link: string;
  /** The flag image, whose `alt` is the language code. */
  flag: string;
  /** Fallback for the code: the link's `id`, minus this prefix. */
  linkIdPrefix: string;
  /** The site's own label for the language, used when we have no name of our own. */
  label: string;
}

export interface Selectors {
  search: SearchSelectors;
  detail: DetailSelectors;
}

export interface RemoteConfig {
  /** Bumped by hand when the shape of this file changes. Informational. */
  version: number;
  /** The site's origin. `https` only. */
  base: string;
  /** Site-relative search path, with `{query}` where the encoded query goes. */
  searchPath: string;
  selectors: Selectors;
  donate: DonatePrompt;
}

/**
 * The bundled copy. `remote/config.json` in this folder should say the same thing at the
 * moment a build is cut; afterwards the remote file is the one that moves.
 */
export const DEFAULT_CONFIG: RemoteConfig = {
  version: 1,
  base: 'https://subtitlecat.com',
  searchPath: '/index.php?search={query}',
  selectors: {
    search: {
      row: 'table.sub-table tbody tr',
      link: 'td:nth-child(1) a',
      source: 'td:nth-child(1)',
      recommended: 'td:nth-child(2) i',
      size: 'td:nth-child(3) .sub-table__metric-value',
      downloads: 'td:nth-child(4)',
      languages: 'td:nth-child(5)',
    },
    detail: {
      heading: 'h2.sec-title',
      headingPrefix: 'All language subtitles for',
      missingMarker: 'file not found',
      block: '.sub-single',
      link: 'a.green-link',
      flag: 'img.flag',
      linkIdPrefix: 'download_',
      label: 'span:nth-of-type(2)',
    },
  },
  donate: NO_PROMPT,
};

/* ----------------------------------------------------------------- validation */

function str(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback;
}

/**
 * The site origin, or the default. Must be `https` and must be an origin, not a page: it
 * is what every subtitlecat path is resolved against and what the SSRF check compares to.
 */
function readBase(value: unknown): string {
  if (typeof value !== 'string') return DEFAULT_CONFIG.base;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.origin : DEFAULT_CONFIG.base;
  } catch {
    return DEFAULT_CONFIG.base;
  }
}

function readSearchPath(value: unknown): string {
  const path = str(value, DEFAULT_CONFIG.searchPath);
  return path.startsWith('/') && path.includes('{query}') ? path : DEFAULT_CONFIG.searchPath;
}

function readStrings<T extends object>(raw: unknown, defaults: T): T {
  const source = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const out: Record<string, string> = {};
  for (const [key, fallback] of Object.entries(defaults)) out[key] = str(source[key], fallback as string);
  return out as T;
}

/**
 * Turn a fetched JSON body into a config, field by field, falling back to the bundled
 * value for anything missing or malformed. Never throws: a bad remote file degrades to
 * the defaults rather than taking search down.
 *
 * It does not check that a selector is *valid* — there is no DOM here to try it against.
 * The offscreen parser catches a selector that throws and the worker retries the parse
 * with the bundled selectors, so a typo in the remote file costs one extra parse, not
 * every search.
 */
export function readConfig(raw: unknown): RemoteConfig {
  if (!raw || typeof raw !== 'object') return DEFAULT_CONFIG;
  const value = raw as Record<string, unknown>;
  const selectors =
    value.selectors && typeof value.selectors === 'object'
      ? (value.selectors as Record<string, unknown>)
      : {};

  return {
    version: typeof value.version === 'number' ? value.version : DEFAULT_CONFIG.version,
    base: readBase(value.base),
    searchPath: readSearchPath(value.searchPath),
    selectors: {
      search: readStrings(selectors.search, DEFAULT_CONFIG.selectors.search),
      detail: readStrings(selectors.detail, DEFAULT_CONFIG.selectors.detail),
    },
    donate: readDonate(value.donate),
  };
}
