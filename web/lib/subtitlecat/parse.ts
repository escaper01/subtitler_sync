import * as cheerio from 'cheerio';
import type { Release, Track } from '@/lib/api-types';
import { languageName } from '@/lib/languages';

/**
 * Parsing subtitlecat's HTML.
 *
 * This is the fragile part of the whole system — it breaks whenever they touch their
 * markup. Two consequences shape the code below:
 *
 *   1. Every field except the link itself is optional. A missing download count or size
 *      degrades a row, it does not drop it. Only a row without a usable path is skipped.
 *   2. Selectors lean on structure (`table.sub-table tbody tr`, `.sub-single`) rather than
 *      on the ad wrappers and utility classes around them, which change far more often.
 *
 * Because it runs server-side, a break here is fixed by a deploy rather than by every
 * user updating their extension. That was the main reason for putting it here at all.
 */

/** `subs/45/Some.Release.html` → a stable id. The numeric segment alone is not unique. */
function releaseId(path: string): string {
  return path.replace(/^\/+/, '').replace(/\.html$/i, '');
}

function toInt(raw: string | undefined): number {
  if (!raw) return 0;
  const digits = raw.replace(/[^\d]/g, '');
  return digits ? Number.parseInt(digits, 10) : 0;
}

/**
 * Parse the search results table.
 *
 * Row shape, as of writing:
 *   td0  <a href="subs/45/Title.html">Title</a> (translated from English)
 *   td1  a thumbs-up marker, or nothing
 *   td2  size
 *   td3  "N downloads"
 *   td4  "N languages"
 */
export function parseSearch(html: string): Release[] {
  const $ = cheerio.load(html);
  const releases: Release[] = [];
  const seen = new Set<string>();

  $('table.sub-table tbody tr').each((_, element) => {
    const row = $(element);
    const link = row.find('td').first().find('a').first();

    const path = link.attr('href')?.trim();
    const title = link.text().trim();
    if (!path || !title || !/\.html$/i.test(path)) return;

    const id = releaseId(path);
    // The same upload can appear twice across paginated/duplicated rows.
    if (seen.has(id)) return;
    seen.add(id);

    const cells = row.find('td');
    const firstCell = cells.eq(0).text();
    const sourceLanguage = /translated from ([^)]+)\)/i.exec(firstCell)?.[1]?.trim() ?? null;

    releases.push({
      id,
      path: path.replace(/^\/+/, ''),
      title,
      sourceLanguage,
      downloads: toInt(cells.eq(3).text()),
      languageCount: toInt(cells.eq(4).text()),
      size: cells.eq(2).find('.sub-table__metric-value').text().trim() || null,
      recommended: cells.eq(1).find('i').length > 0,
    });
  });

  return releases;
}

/**
 * Parse a release's detail page into its per-language downloads.
 *
 * Each `.sub-single` block is one language, holding either a Download link to a `.srt`
 * that already exists, or a Translate button for one the site would generate on demand.
 * Only the former is usable: the button triggers a server-side translation job we have no
 * way to wait on, so those languages are simply absent from the result.
 */
export function parseDetail(
  html: string,
  id: string,
): { title: string; tracks: Track[]; missing: boolean } {
  const $ = cheerio.load(html);

  const heading = $('h2.sec-title').first().text().trim();
  const title = /^All language subtitles for\s+(.*)$/i.exec(heading)?.[1]?.trim() ?? heading;

  // A release that no longer exists still answers 200, with a "File Not Found" heading and
  // a full grid of language rows whose `.srt` files are the site's 404 page machine-
  // translated into each language. Left unchecked they reach the panel as real choices and
  // download as junk, so the caller is told to treat this as a 404.
  const missing = /file not found/i.test(heading);

  const tracks: Track[] = [];
  const seen = new Set<string>();

  $('.sub-single').each((_, element) => {
    const block = $(element);
    const anchor = block.find('a.green-link').first();

    const path = anchor.attr('href')?.trim();
    if (!path || !/\.srt$/i.test(path)) return;

    // The flag's alt attribute carries the language code; the id on the download link
    // (`download_zh-CN`) is the backup, since a missing flag image is common.
    const code =
      block.find('img.flag').first().attr('alt')?.trim() ||
      anchor.attr('id')?.replace(/^download_/, '').trim();
    if (!code) return;

    if (seen.has(code)) return;
    seen.add(code);

    // The label sits in the block's second span, between the flag and the link.
    const siteLabel = block.find('span').eq(1).text().trim();

    tracks.push({
      releaseId: id,
      code,
      name: languageName(code, siteLabel || undefined),
      path: path.replace(/^\/+/, ''),
    });
  });

  return { title, tracks, missing };
}
