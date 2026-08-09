import { describe, expect, it } from 'vitest';
import { downloadSubtitle, releaseTracks, search } from '@/lib/subtitlecat';

/**
 * Live check against the real subtitlecat.
 *
 * Skipped unless `LIVE=1`, because it hits the network and depends on someone else's
 * uptime — but it is the only thing that catches the failure that actually matters: they
 * changed their markup and the parser now returns nothing.
 *
 *   LIVE=1 npm test
 *
 * Run it when a user reports "search finds nothing", before touching any code.
 */

const live = process.env.LIVE === '1';

describe.skipIf(!live)('subtitlecat, live', () => {
  it('finds releases for a well-known film', { timeout: 30_000 }, async () => {
    const releases = await search('shawshank');

    expect(releases.length).toBeGreaterThan(5);
    expect(releases[0]!.title.toLowerCase()).toContain('shawshank');
    expect(releases[0]!.path).toMatch(/^subs\/\d+\/.+\.html$/);

    // Sorted best-first, so the top result should be a popular one rather than a stray.
    expect(releases[0]!.downloads).toBeGreaterThan(0);
  });

  it('expands a release into per-language downloads', { timeout: 30_000 }, async () => {
    const releases = await search('shawshank');
    const release = releases[0]!;

    const { tracks, title } = await releaseTracks(release.path);

    expect(title.length).toBeGreaterThan(0);
    expect(tracks.length).toBeGreaterThan(10);
    expect(tracks.map((track) => track.code)).toContain('en');
    expect(tracks.every((track) => /\.srt$/i.test(track.path))).toBe(true);
  });

  it('downloads a subtitle that parses as one', { timeout: 30_000 }, async () => {
    const releases = await search('shawshank');
    const { tracks } = await releaseTracks(releases[0]!.path);
    const english = tracks.find((track) => track.code === 'en')!;

    const { text, filename } = await downloadSubtitle(english.path);

    expect(filename).toMatch(/\.srt$/i);
    expect(text).toContain('-->');
    expect(text.length).toBeGreaterThan(1000);
  });

  it('refuses a path that points off-site', async () => {
    await expect(downloadSubtitle('https://example.com/evil.srt')).rejects.toThrow(
      /does not belong/i,
    );
    await expect(downloadSubtitle('//example.com/evil.srt')).rejects.toThrow(/does not belong/i);
  });
});
