import { describe, expect, it } from 'vitest';
import { readDonate, safeColor, safeUrl } from '@/lib/donate';

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
