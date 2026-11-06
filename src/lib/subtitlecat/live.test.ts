import { Window } from 'happy-dom';
import { describe, expect, it } from 'vitest';
import { SITE_CONFIG } from '@/lib/subtitlecat/config';
import { fetchText, resolveUpstream } from '@/lib/subtitlecat/http';
import { parseDetail, parseSearch } from '@/lib/subtitlecat/parse';

/**
 * Live check against the real subtitlecat, with the **bundled** selectors.
 *
 * Skipped unless `LIVE=1`, because it hits the network and depends on someone else's
 * uptime — but it is the only thing that catches the failure that actually matters: they
 * changed their markup and the parser now returns nothing.
 *
 *   LIVE=1 npm test
 *
 * Run it when a user reports "search finds nothing", before touching any code. If it
 * fails, the fix is a new selector in `SITE_CONFIG`, then a new build.
 *
 * Node's `fetch` stands in for the worker's here, and happy-dom for the offscreen
 * document — instantiated directly rather than as the test environment, because the
 * environment would replace `fetch` with its own, which cannot make this request.
 */

const live = process.env.LIVE === '1';
const { base, searchPath, selectors } = SITE_CONFIG;

const window = new Window();

function doc(html: string): Document {
  return new window.DOMParser().parseFromString(html, 'text/html') as unknown as Document;
}

/** Most-downloaded first, as the worker sorts them, so `[0]` is a popular release. */
async function searchLive(query: string) {
  const url = new URL(searchPath.replace('{query}', encodeURIComponent(query)), `${base}/`);
  return parseSearch(doc(await fetchText(base, url)), selectors.search).sort(
    (a, b) => b.downloads - a.downloads,
  );
}

describe.skipIf(!live)('subtitlecat, live', () => {
  it('finds releases for a well-known film', { timeout: 30_000 }, async () => {
    const releases = await searchLive('shawshank');

    expect(releases.length).toBeGreaterThan(5);
    expect(releases[0]!.title.toLowerCase()).toContain('shawshank');
    expect(releases[0]!.path).toMatch(/^subs\/\d+\/.+\.html$/);
    expect(releases.some((release) => release.downloads > 0)).toBe(true);
  });

  it('expands a release into per-language downloads', { timeout: 30_000 }, async () => {
    const releases = await searchLive('shawshank');
    const release = releases[0]!;

    const url = resolveUpstream(base, release.path);
    const { tracks, title, missing } = parseDetail(
      doc(await fetchText(base, url)),
      release.id,
      selectors.detail,
    );

    expect(missing).toBe(false);
    expect(title.length).toBeGreaterThan(0);
    expect(tracks.length).toBeGreaterThan(10);
    expect(tracks.map((track) => track.code)).toContain('en');
    expect(tracks.every((track) => /\.srt$/i.test(track.path))).toBe(true);
  });

  it('downloads a subtitle that parses as one', { timeout: 30_000 }, async () => {
    const releases = await searchLive('shawshank');
    const url = resolveUpstream(base, releases[0]!.path);
    const { tracks } = parseDetail(doc(await fetchText(base, url)), 'x', selectors.detail);
    const english = tracks.find((track) => track.code === 'en')!;

    const text = await fetchText(base, resolveUpstream(base, english.path));

    expect(text).toContain('-->');
    expect(text.length).toBeGreaterThan(1000);
  });
});

describe('resolveUpstream', () => {
  it('refuses a path that points off-site', () => {
    expect(() => resolveUpstream(base, 'https://example.com/evil.srt')).toThrow(/does not belong/i);
    expect(() => resolveUpstream(base, '//example.com/evil.srt')).toThrow(/does not belong/i);
  });

  it('resolves a site-relative path against the base', () => {
    expect(resolveUpstream(base, 'subs/45/x.html').toString()).toBe(`${base}/subs/45/x.html`);
    expect(resolveUpstream(base, '/subs/45/x.html').toString()).toBe(`${base}/subs/45/x.html`);
  });
});
