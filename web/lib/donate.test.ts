import { describe, expect, it } from 'vitest';
import { safeColor, safeHeading, safeLabel, safeMessage, safeProvider, safeUrl } from '@/lib/donate';

/**
 * These are not string-tidying helpers with tests bolted on. Every value they return is
 * rendered by the extension **inside a page we do not control** — a donation URL becomes
 * an `href`, the colour becomes an inline style value — so each of these is the boundary
 * between an admin form and somebody else's document.
 *
 * The cases below are the ones that would actually be attempted, not a spread of plausible
 * inputs.
 */

describe('safeUrl', () => {
  it('accepts the two protocols that can be an href', () => {
    expect(safeUrl('https://ko-fi.com/someone')).toBe('https://ko-fi.com/someone');
    expect(safeUrl('http://example.com/tip')).toBe('http://example.com/tip');
  });

  it('drops javascript:, which would be script execution in every page the extension touches', () => {
    expect(safeUrl('javascript:alert(1)')).toBeNull();
    // Case and padding are not a bypass: the URL parser lowercases the protocol, and the
    // value is trimmed before parsing.
    expect(safeUrl('  JavaScript:alert(1)')).toBeNull();
  });

  it('drops data:, which would serve a page of our choosing from our own button', () => {
    expect(safeUrl('data:text/html,<script>alert(1)</script>')).toBeNull();
  });

  it('drops protocol-relative and bare hosts rather than guessing a scheme', () => {
    // `//evil.com` parses as a path, not a URL, so it fails to construct. Guessing https
    // here would mean a typo silently becomes a link to somewhere else.
    expect(safeUrl('//evil.com')).toBeNull();
    expect(safeUrl('paypal.me/someone')).toBeNull();
  });

  it('treats empty and whitespace as "no link", not as an error', () => {
    expect(safeUrl('')).toBeNull();
    expect(safeUrl('   ')).toBeNull();
    expect(safeUrl(null)).toBeNull();
    expect(safeUrl(undefined)).toBeNull();
  });
});

describe('safeColor', () => {
  it('accepts #rrggbb in either case', () => {
    expect(safeColor('#38bdf8')).toBe('#38bdf8');
    expect(safeColor('#AABBCC')).toBe('#AABBCC');
  });

  it('refuses anything that is not exactly six hex digits', () => {
    // The value lands in an inline style. A CSS function or a shorthand that the browser
    // would happily parse is exactly what must not reach it.
    expect(safeColor('red')).toBe('#38bdf8');
    expect(safeColor('#fff')).toBe('#38bdf8');
    expect(safeColor('#38bdf8; background: url(x)')).toBe('#38bdf8');
    expect(safeColor('rgb(0,0,0)')).toBe('#38bdf8');
  });

  it('can be asked for an empty fallback, which is how the admin route detects a bad value', () => {
    expect(safeColor('nonsense', '')).toBe('');
    expect(safeColor('#38bdf8', '')).toBe('#38bdf8');
  });
});

describe('the text helpers', () => {
  it('collapse whitespace so a pasted multi-line message renders as one line', () => {
    expect(safeMessage('  a   \n\n  b  ')).toBe('a b');
    expect(safeHeading('\tSupport   this\n')).toBe('Support this');
  });

  it('truncate rather than reject, so a long paste is not silently lost on save', () => {
    expect(safeMessage('x'.repeat(400))).toHaveLength(240);
    expect(safeHeading('x'.repeat(400))).toHaveLength(60);
    expect(safeLabel('x'.repeat(400))).toHaveLength(40);
  });
});

describe('safeProvider', () => {
  it('normalises case and padding, since it is only ever used to pick an icon', () => {
    expect(safeProvider('  PayPal ')).toBe('paypal');
  });

  it('falls back to custom rather than rendering nothing', () => {
    expect(safeProvider('')).toBe('custom');
    expect(safeProvider(null)).toBe('custom');
  });

  it('passes through an unknown provider, so adding one needs no code change', () => {
    expect(safeProvider('stripe')).toBe('stripe');
  });
});
