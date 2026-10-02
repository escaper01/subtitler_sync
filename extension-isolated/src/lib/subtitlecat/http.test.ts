import { describe, expect, it } from 'vitest';
import { resolveUpstream, sameSite } from '@/lib/subtitlecat/http';

const BASE = 'https://subtitlecat.com';

describe('sameSite', () => {
  it('accepts the site itself', () => {
    expect(sameSite(BASE, new URL('https://subtitlecat.com/subs/1/x.html'))).toBe(true);
  });

  // subtitlecat.com answers detail pages with a redirect to www. — the first version of
  // this check called that "off-site" and every release stayed on "Loading…" for ever.
  it('accepts the www form of the site', () => {
    expect(sameSite(BASE, new URL('https://www.subtitlecat.com/subs/1/x.html'))).toBe(true);
  });

  it('refuses another host, a lookalike, or a downgrade to http', () => {
    expect(sameSite(BASE, new URL('https://evil.com/'))).toBe(false);
    expect(sameSite(BASE, new URL('https://subtitlecat.com.evil.com/'))).toBe(false);
    expect(sameSite(BASE, new URL('http://subtitlecat.com/'))).toBe(false);
  });
});

describe('resolveUpstream', () => {
  it('still refuses paths that leave the site', () => {
    expect(() => resolveUpstream(BASE, '//evil.com/x.srt')).toThrow();
    expect(() => resolveUpstream(BASE, 'https://evil.com/x.srt')).toThrow();
  });
});
