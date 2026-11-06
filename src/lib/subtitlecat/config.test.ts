import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, readConfig } from '@/lib/subtitlecat/config';
import { readDonate, safeColor, safeUrl } from '@/lib/donate';

/**
 * The remote file is edited by hand and fetched by every install, so what matters is
 * that nothing it can get wrong reaches the parser or the panel: every field falls back
 * on its own, and the validators that used to run on the server run here.
 */

describe('readConfig', () => {
  it('falls back to the bundled config for anything that is not an object', () => {
    expect(readConfig(null)).toEqual(DEFAULT_CONFIG);
    expect(readConfig('nope')).toEqual(DEFAULT_CONFIG);
    expect(readConfig(42)).toEqual(DEFAULT_CONFIG);
  });

  it('is the bundled config when given an empty object', () => {
    expect(readConfig({})).toEqual(DEFAULT_CONFIG);
  });

  it('takes a selector that was given and keeps the default for one that was not', () => {
    const config = readConfig({ selectors: { search: { row: 'tr.result' } } });
    expect(config.selectors.search.row).toBe('tr.result');
    expect(config.selectors.search.link).toBe(DEFAULT_CONFIG.selectors.search.link);
    expect(config.selectors.detail).toEqual(DEFAULT_CONFIG.selectors.detail);
  });

  it('ignores a selector that is empty or not a string', () => {
    const config = readConfig({ selectors: { detail: { block: '', link: 7 } } });
    expect(config.selectors.detail.block).toBe(DEFAULT_CONFIG.selectors.detail.block);
    expect(config.selectors.detail.link).toBe(DEFAULT_CONFIG.selectors.detail.link);
  });

  it('accepts only an https origin as the base', () => {
    expect(readConfig({ base: 'https://subtitlecat.org' }).base).toBe('https://subtitlecat.org');
    // Reduced to the origin: the base is what paths resolve against, never a page.
    expect(readConfig({ base: 'https://subtitlecat.com/some/page' }).base).toBe('https://subtitlecat.com');
    expect(readConfig({ base: 'http://subtitlecat.com' }).base).toBe(DEFAULT_CONFIG.base);
    expect(readConfig({ base: 'not a url' }).base).toBe(DEFAULT_CONFIG.base);
  });

  it('requires the search path to be site-relative and carry the query placeholder', () => {
    expect(readConfig({ searchPath: '/search?q={query}' }).searchPath).toBe('/search?q={query}');
    expect(readConfig({ searchPath: '/search?q=' }).searchPath).toBe(DEFAULT_CONFIG.searchPath);
    expect(readConfig({ searchPath: 'https://evil.example/{query}' }).searchPath).toBe(
      DEFAULT_CONFIG.searchPath,
    );
  });

  it('carries a donation prompt through', () => {
    const config = readConfig({
      donate: {
        enabled: true,
        heading: 'Like it?',
        message: 'Keep it going.',
        color: '#ff8800',
        links: [{ provider: 'kofi', label: 'Ko-fi', url: 'https://ko-fi.com/x' }],
      },
    });
    expect(config.donate.enabled).toBe(true);
    expect(config.donate.links).toHaveLength(1);
  });
});

describe('readDonate', () => {
  it('is off unless explicitly enabled', () => {
    expect(readDonate(undefined).enabled).toBe(false);
    expect(readDonate({ heading: 'x', links: [] }).enabled).toBe(false);
    expect(readDonate({ enabled: 'true' }).enabled).toBe(false);
  });

  it('drops a link whose URL is not http(s) rather than rendering it dead', () => {
    const prompt = readDonate({
      enabled: true,
      links: [
        { provider: 'paypal', label: 'PayPal', url: 'javascript:alert(1)' },
        { provider: 'custom', label: 'Data', url: 'data:text/html,hi' },
        { provider: 'kofi', label: 'Ko-fi', url: 'https://ko-fi.com/x' },
      ],
    });
    expect(prompt.links.map((link) => link.provider)).toEqual(['kofi']);
  });

  it('collapses whitespace and caps every string', () => {
    const prompt = readDonate({
      enabled: true,
      heading: '  a   very\n long   heading '.repeat(10),
      message: 'm'.repeat(1000),
      links: [{ provider: 'X'.repeat(50), label: ' l '.repeat(40), url: 'https://a.b' }],
    });
    expect(prompt.heading.length).toBeLessThanOrEqual(60);
    expect(prompt.heading).not.toMatch(/\s{2}/);
    expect(prompt.message.length).toBe(240);
    expect(prompt.links[0]!.provider.length).toBeLessThanOrEqual(24);
    expect(prompt.links[0]!.label.length).toBeLessThanOrEqual(40);
  });

  it('falls back on a colour that is not #rrggbb', () => {
    expect(safeColor('#abc')).toBe('#38bdf8');
    expect(safeColor('red; background: url(x)')).toBe('#38bdf8');
    expect(safeColor('#AbCdEf')).toBe('#AbCdEf');
    expect(readDonate({ enabled: true, color: 'blue' }).color).toBe('#38bdf8');
  });

  it('accepts http and https only', () => {
    expect(safeUrl('https://example.com/a')).toBe('https://example.com/a');
    expect(safeUrl('http://example.com')).toBe('http://example.com/');
    expect(safeUrl('ftp://example.com')).toBeNull();
    expect(safeUrl('')).toBeNull();
    expect(safeUrl(12)).toBeNull();
  });
});
