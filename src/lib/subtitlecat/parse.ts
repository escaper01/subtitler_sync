import type { Release, Track } from '@/lib/api-types';
import { languageName } from '@/lib/languages';
import type { DetailSelectors, SearchSelectors } from '@/lib/subtitlecat/config';

/**
 * Parsing subtitlecat's HTML.
 *
 * A port of `web/lib/subtitlecat/parse.ts` from cheerio onto the DOM — it runs in the
 * offscreen document, over a `Document` that `DOMParser` produced from HTML the worker
 * fetched. An inert document: nothing in it executes, loads, or renders.
 *
 * Still the fragile part of the whole system. Two things shape the code:
 *
 *   1. Every field except the link itself is optional. A missing download count or size
 *      degrades a row, it does not drop it. Only a row without a usable path is skipped.
 *   2. **The selectors are parameters**, not constants. They live in `config.ts`, so a
 *      renamed class on the site is an edit to one object. A selector that does not parse
 *      throws out of `querySelector` and surfaces as a failure — this file catches nothing.
 */

/** `subs/45/Some.Release.html` → a stable id. The numeric segment alone is not unique. */
export function releaseId(path: string): string {
  return path.replace(/^\/+/, '').replace(/\.html$/i, '');
}

function toInt(raw: string | null | undefined): number {
  if (!raw) return 0;
  const digits = raw.replace(/[^\d]/g, '');
  return digits ? Number.parseInt(digits, 10) : 0;
}

function text(scope: ParentNode, selector: string): string {
  return scope.querySelector(selector)?.textContent?.trim() ?? '';
}

/** Parse the search results table. */
export function parseSearch(doc: Document, s: SearchSelectors): Release[] {
  const releases: Release[] = [];
  const seen = new Set<string>();

  for (const row of doc.querySelectorAll(s.row)) {
    const link = row.querySelector(s.link);

    const path = link?.getAttribute('href')?.trim();
    const title = link?.textContent?.trim();
    if (!path || !title || !/\.html$/i.test(path)) continue;

    const id = releaseId(path);
    // The same upload can appear twice across paginated/duplicated rows.
    if (seen.has(id)) continue;
    seen.add(id);

    const sourceLanguage = /translated from ([^)]+)\)/i.exec(text(row, s.source))?.[1]?.trim() ?? null;

    releases.push({
      id,
      path: path.replace(/^\/+/, ''),
      title,
      sourceLanguage,
      downloads: toInt(text(row, s.downloads)),
      languageCount: toInt(text(row, s.languages)),
      size: text(row, s.size) || null,
      recommended: row.querySelector(s.recommended) !== null,
    });
  }

  return releases;
}

export interface Detail {
  title: string;
  tracks: Track[];
  missing: boolean;
}

/**
 * Parse a release's detail page into its per-language downloads.
 *
 * Only languages with an existing `.srt` are usable: the Translate button triggers a
 * server-side translation job there is no way to wait on, so those are simply absent.
 */
export function parseDetail(doc: Document, id: string, s: DetailSelectors): Detail {
  const heading = text(doc, s.heading);
  const prefix = s.headingPrefix.toLowerCase();
  const title = heading.toLowerCase().startsWith(prefix)
    ? heading.slice(s.headingPrefix.length).trim()
    : heading;

  // A release that no longer exists still answers 200, with a "File Not Found" heading and
  // a full grid of language rows whose `.srt` files are the site's 404 page machine-
  // translated into each language. Left unchecked they reach the panel as real choices and
  // download as junk, so the caller is told to treat this as a 404.
  const missing = heading.toLowerCase().includes(s.missingMarker.toLowerCase());

  const tracks: Track[] = [];
  const seen = new Set<string>();

  for (const block of doc.querySelectorAll(s.block)) {
    const anchor = block.querySelector(s.link);

    const path = anchor?.getAttribute('href')?.trim();
    if (!anchor || !path || !/\.srt$/i.test(path)) continue;

    // The flag's alt attribute carries the language code; the id on the download link
    // (`download_zh-CN`) is the backup, since a missing flag image is common.
    const fromFlag = block.querySelector(s.flag)?.getAttribute('alt')?.trim();
    const fromId = anchor.getAttribute('id')?.trim();
    const code =
      fromFlag ||
      (fromId && fromId.startsWith(s.linkIdPrefix) ? fromId.slice(s.linkIdPrefix.length) : '');
    if (!code) continue;

    if (seen.has(code)) continue;
    seen.add(code);

    const siteLabel = text(block, s.label);

    tracks.push({
      releaseId: id,
      code,
      name: languageName(code, siteLabel || undefined),
      path: path.replace(/^\/+/, ''),
    });
  }

  return { title, tracks, missing };
}
