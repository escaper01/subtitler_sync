import { describe, expect, it } from 'vitest';
import type { Track } from '@/lib/api-types';
import { MAX_LANGUAGES, parseLanguages } from '@/lib/api';
import { filterByLanguages } from '@/lib/subtitlecat';

/**
 * The language parameter and the filter behind it.
 *
 * Both matter more than they look. A release page is fetched once and already contains
 * every language, so asking for two costs subtitlecat nothing — which is the whole reason
 * the client sends both rather than making a second request per release. If this parser or
 * this filter drops one of the pair, the client silently falls back to one subtitle and
 * nothing anywhere reports an error.
 */

function track(code: string, releaseId = 'r1'): Track {
  return { releaseId, code, name: code.toUpperCase(), path: `subs/${releaseId}-${code}.srt` };
}

describe('parseLanguages', () => {
  it('accepts a single code, as every existing client sends', () => {
    expect(parseLanguages('en')).toEqual(['en']);
  });

  it('accepts a pair', () => {
    expect(parseLanguages('en,de')).toEqual(['en', 'de']);
  });

  it('preserves the order asked for — the first is the caller primary track', () => {
    expect(parseLanguages('de,en')).toEqual(['de', 'en']);
  });

  it('tolerates whitespace around the comma', () => {
    expect(parseLanguages(' en , de ')).toEqual(['en', 'de']);
  });

  it('collapses a duplicate rather than refusing it', () => {
    // `en,en` is a clumsy way of saying `en`, not an error — and it is exactly what the
    // client would send if both slots were left on the same language.
    expect(parseLanguages('en,en')).toEqual(['en']);
  });

  it('refuses more than the cap', () => {
    expect(parseLanguages('en,de,fr')).toBeNull();
    expect(MAX_LANGUAGES).toBe(2);
  });

  it('refuses an unknown code rather than silently dropping it', () => {
    // Dropping it would return an empty result, which is indistinguishable from "this film
    // has no subtitles" — a far worse thing to debug than a 400.
    expect(parseLanguages('en,zzz')).toBeNull();
    expect(parseLanguages('zzz')).toBeNull();
  });

  it('refuses empty and missing input', () => {
    expect(parseLanguages('')).toBeNull();
    expect(parseLanguages('   ')).toBeNull();
    expect(parseLanguages(null)).toBeNull();
    expect(parseLanguages(',')).toBeNull();
  });
});

describe('filterByLanguages', () => {
  const tracks = [track('fr'), track('de'), track('en'), track('es')];

  it('keeps only what was asked for', () => {
    expect(filterByLanguages(tracks, ['en']).map((t) => t.code)).toEqual(['en']);
  });

  it('returns the pair in the order asked for, not the order upstream listed them', () => {
    // The client renders each release's tracks top-down and loads the first as the
    // primary, so this ordering is load-bearing rather than cosmetic.
    expect(filterByLanguages(tracks, ['en', 'de']).map((t) => t.code)).toEqual(['en', 'de']);
    expect(filterByLanguages(tracks, ['de', 'en']).map((t) => t.code)).toEqual(['de', 'en']);
  });

  it('matches case-insensitively, because upstream codes are not consistent', () => {
    expect(filterByLanguages([track('zh-CN')], ['zh-cn']).map((t) => t.code)).toEqual(['zh-CN']);
  });

  it('returns what it has when only one of the pair exists', () => {
    // A release with the primary but not the secondary is normal, and must not come back
    // empty — the client shows the one it got and says which is missing.
    expect(filterByLanguages([track('en')], ['en', 'de']).map((t) => t.code)).toEqual(['en']);
  });

  it('returns nothing when the release has neither', () => {
    expect(filterByLanguages([track('fr')], ['en', 'de'])).toEqual([]);
  });

  it('does not invent a track for a language the release lacks', () => {
    expect(filterByLanguages([], ['en', 'de'])).toEqual([]);
  });
});
