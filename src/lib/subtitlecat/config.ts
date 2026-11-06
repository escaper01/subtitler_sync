import type { DonatePrompt } from '@/lib/api-types';
import { NO_PROMPT } from '@/lib/donate';

/**
 * The subtitle site, as data: its address, where search lives, and the selectors the
 * parser uses to read its pages.
 *
 * The selectors are parameters rather than constants inside the parser so that a change to
 * the site's markup is an edit to one object here, with the tests to prove it, instead of a
 * hunt through the parsing code. They are **bundled**: nothing is fetched at run time, so a
 * renamed class means a new build.
 *
 * The donation prompt lives here too. It is off by default; to show one, set `donate` below
 * and ship a build.
 *
 * Everything in here is pure. Parsing lives in `parse.ts`, which runs in the offscreen
 * document.
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

export interface SiteConfig {
  /** The site's origin. `https` only. */
  base: string;
  /** Site-relative search path, with `{query}` where the encoded query goes. */
  searchPath: string;
  selectors: Selectors;
  donate: DonatePrompt;
}

/** The bundled configuration, and the only one: nothing is fetched. */
export const SITE_CONFIG: SiteConfig = {
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
