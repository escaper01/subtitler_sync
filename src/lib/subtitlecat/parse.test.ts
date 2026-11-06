// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { SITE_CONFIG } from '@/lib/subtitlecat/config';
import { parseDetail, parseSearch } from '@/lib/subtitlecat/parse';

/**
 * The same fixtures as `web/lib/subtitlecat/parse.test.ts`, run against the DOM port.
 * happy-dom stands in for the offscreen document's `DOMParser`; the parser sees a
 * `Document` either way.
 *
 * Fixtures are trimmed to the structure the parser actually reads — the table rows and
 * the `.sub-single` blocks — with the ad wrappers and the site chrome left out. They keep
 * the awkward parts of the real markup on purpose: percent-encoded paths, spaces in
 * filenames, a Translate button where a Download link would be, and a row with no size.
 */

const SEARCH = SITE_CONFIG.selectors.search;
const DETAIL = SITE_CONFIG.selectors.detail;

function doc(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html');
}

const SEARCH_HTML = `
<div class="subtitles"><div class="container"><div class="row"><div class="col-12">
<table class="table sub-table">
  <thead><tr><th colspan="2"><h2 class="sec-title">3 subtitles found</h2></th><th>SIZE</th><th>DOWNLOADS</th><th>LANGUAGES</th></tr></thead>
  <tbody>
    <tr>
      <td><a href="subs/45/The%20Shawshank%20Redemption%201994.720p.BRRip.x264.YIFY.html">The Shawshank Redemption 1994.720p.BRRip.x264.YIFY</a> (translated from English)</td>
      <td><i class='fas fa-thumbs-up'>&#128077;</i></td>
      <td class="sub-table__size-cell"><span class="sub-table__metric-inline">SIZE</span><span class="sub-table__metric-value">136 KB</span></td>
      <td>412 downloads</td>
      <td>143 languages</td>
    </tr>
    <tr>
      <td><a href="subs/1301/Shawshank_Les%20%C3%89vad%C3%A9s%201994_vf.html">Shawshank_Les Évadés 1994_vf</a> (translated from French)</td>
      <td>&nbsp;</td>
      <td class="sub-table__size-cell"><span class="sub-table__metric-value">122 KB</span></td>
      <td>1 downloads</td>
      <td>1 languages</td>
    </tr>
    <tr>
      <td><a href="subs/8/No.Size.Here.html">No.Size.Here</a></td>
      <td>&nbsp;</td>
      <td class="sub-table__size-cell"></td>
      <td>7 downloads</td>
      <td>7 languages</td>
    </tr>
  </tbody>
</table>
</div></div></div></div>`;

describe('parseSearch', () => {
  const releases = parseSearch(doc(SEARCH_HTML), SEARCH);

  it('finds every row that has a release link', () => {
    expect(releases).toHaveLength(3);
  });

  it('reads the title, path and counts', () => {
    const first = releases[0]!;
    expect(first.title).toBe('The Shawshank Redemption 1994.720p.BRRip.x264.YIFY');
    expect(first.path).toBe('subs/45/The%20Shawshank%20Redemption%201994.720p.BRRip.x264.YIFY.html');
    expect(first.downloads).toBe(412);
    expect(first.languageCount).toBe(143);
    expect(first.size).toBe('136 KB');
  });

  it('picks up the source language and the thumbs-up marker', () => {
    expect(releases[0]!.sourceLanguage).toBe('English');
    expect(releases[0]!.recommended).toBe(true);
    expect(releases[1]!.sourceLanguage).toBe('French');
    expect(releases[1]!.recommended).toBe(false);
  });

  it('degrades a row with missing fields instead of dropping it', () => {
    const third = releases[2]!;
    expect(third.title).toBe('No.Size.Here');
    expect(third.size).toBeNull();
    expect(third.sourceLanguage).toBeNull();
  });

  it('derives an id that survives the numeric segment being reused', () => {
    // Two uploads can share `subs/572/`; the filename is what distinguishes them.
    expect(releases[0]!.id).toBe(
      'subs/45/The%20Shawshank%20Redemption%201994.720p.BRRip.x264.YIFY',
    );
    expect(new Set(releases.map((r) => r.id)).size).toBe(3);
  });

  it('returns nothing for a page with no results table', () => {
    expect(parseSearch(doc('<html><body><p>Nothing here</p></body></html>'), SEARCH)).toEqual([]);
  });

  it('throws on a selector that does not parse, so the worker can retry with the defaults', () => {
    expect(() => parseSearch(doc(SEARCH_HTML), { ...SEARCH, row: 'td[' })).toThrow();
  });
});

const DETAIL_HTML = `
<div class="all-sub"><div class="container">
  <div class="row"><div class="col-12">
    <h2 class="sec-title">All language subtitles for The Shawshank Redemption 1994.720p.BRRip.x264.YIFY</h2>
  </div></div>
  <div class="row">
    <div class="col-md-6 col-lg-4"><div class="sub-single">
      <span><img src="/assets/flags/gb.png" alt="en" class="flag"></span>
      <span>English</span>
      <span><a id="download_en" onclick="log_download(534687);" href="/subs/53/The Shawshank Redemption 1994.720p.BRRip.x264.YIFY-en.srt" class="green-link">Download</a></span>
    </div></div>
    <div class="col-md-6 col-lg-4"><div class="sub-single">
      <span><img src="/assets/flags/il.png" alt="iw" class="flag"></span>
      <span>Hebrew</span>
      <span><a id="download_iw" href="/subs/78/The Shawshank Redemption 1994.720p.BRRip.x264.YIFY-iw.srt" class="green-link">Download</a></span>
    </div></div>
    <div class="col-md-6 col-lg-4"><div class="sub-single">
      <span><img src="/assets/flags/cn.png" alt="zh-CN" class="flag"></span>
      <span>Chinese (Simplified)</span>
      <span><a id="download_zh-CN" href="/subs/885/The Shawshank Redemption 1994.720p.BRRip.x264.YIFY-zh-CN.srt" class="green-link">Download</a></span>
    </div></div>
    <div class="col-md-6 col-lg-4"><div class="sub-single">
      <span><img src="/assets/flags/us.png" alt="chr" class="flag"></span>
      <span>Cherokee</span>
      <span><button id="chr" onclick="translate_from_server_folder('chr', 'x-orig.srt', '/subs/45/')" class="yellow-link">Translate</button></span>
    </div></div>
    <div class="col-md-6 col-lg-4"><div class="sub-single">
      <span><img src="/assets/flags/zm.png" alt="bem" class="flag"></span>
      <span>Bemba</span>
      <span><a id="download_bem" href="/subs/1016/The Shawshank Redemption 1994.720p.BRRip.x264.YIFY-bem.srt" class="green-link">Download</a></span>
    </div></div>
  </div>
</div></div>`;

/**
 * A release that no longer exists. The site answers 200 with this, and still renders a
 * full grid of languages whose `.srt` files are its 404 page in translation.
 */
const MISSING_HTML = `
<div class="all-sub"><div class="container">
  <div class="row"><div class="col-12">
    <h2 class="sec-title">File Not Found (nope)</h2>
  </div></div>
  <div class="row">
    <div class="col-md-6 col-lg-4"><div class="sub-single">
      <span><img src="/assets/flags/bd.png" alt="bn" class="flag"></span>
      <span>Bengali</span>
      <span><a id="download_bn" href="/subs/1091/nope-bn.srt" class="green-link">Download</a></span>
    </div></div>
  </div>
</div></div>`;

describe('parseDetail', () => {
  const { title, tracks } = parseDetail(doc(DETAIL_HTML), 'subs/45/The.Shawshank', DETAIL);

  it('strips the boilerplate off the heading', () => {
    expect(title).toBe('The Shawshank Redemption 1994.720p.BRRip.x264.YIFY');
  });

  it('keeps only languages that already have a file', () => {
    // Cherokee offers a Translate button, not a download — it cannot be fetched.
    expect(tracks.map((track) => track.code)).toEqual(['en', 'iw', 'zh-CN', 'bem']);
  });

  it('carries the path with its spaces intact, for the fetcher to encode', () => {
    expect(tracks[0]!.path).toBe(
      'subs/53/The Shawshank Redemption 1994.720p.BRRip.x264.YIFY-en.srt',
    );
  });

  it('names languages from our own table, not the site label', () => {
    // The site says "Hebrew" for `iw` too, but the point is we do not depend on it.
    expect(tracks[1]).toMatchObject({ code: 'iw', name: 'Hebrew' });
    expect(tracks[2]).toMatchObject({ code: 'zh-CN', name: 'Chinese (Simplified)' });
  });

  it('falls back to the site label for a language outside our list', () => {
    expect(tracks[3]).toMatchObject({ code: 'bem', name: 'Bemba' });
  });

  it('falls back to the link id for the code when the flag is missing', () => {
    const html = DETAIL_HTML.replace('<img src="/assets/flags/gb.png" alt="en" class="flag">', '');
    const result = parseDetail(doc(html), 'x', DETAIL);
    expect(result.tracks[0]).toMatchObject({ code: 'en' });
  });

  it('tags every track with the release it came from', () => {
    expect(tracks.every((track) => track.releaseId === 'subs/45/The.Shawshank')).toBe(true);
  });

  it('does not flag a real page as missing', () => {
    expect(parseDetail(doc(DETAIL_HTML), 'x', DETAIL).missing).toBe(false);
  });

  it('flags the soft-404 that still renders downloadable-looking rows', () => {
    const result = parseDetail(doc(MISSING_HTML), 'subs/45/nope', DETAIL);

    // The rows parse fine — that is exactly the problem, and why the flag is needed.
    expect(result.tracks.length).toBeGreaterThan(0);
    expect(result.missing).toBe(true);
  });
});
