import { describe, expect, it } from 'vitest';
import { guessSearchTitle } from '@/lib/searchTitle';

describe('guessSearchTitle', () => {
  it('keeps a title that is already clean', () => {
    expect(guessSearchTitle('The Shawshank Redemption')).toBe('The Shawshank Redemption');
  });

  it('drops the site branding after a separator', () => {
    expect(guessSearchTitle('The Shawshank Redemption | hdfilme.to')).toBe(
      'The Shawshank Redemption',
    );
    expect(guessSearchTitle('kinoger » Breaking Bad')).toBe('Breaking Bad');
  });

  it('keeps the longest segment, since some sites lead with their own name', () => {
    expect(guessSearchTitle('AniWorld | Attack on Titan | Stream')).toBe('Attack on Titan');
  });

  it('strips a trailing domain', () => {
    expect(guessSearchTitle('Inception - hdfilme.to')).toBe('Inception');
  });

  it('removes streaming boilerplate around the title', () => {
    expect(guessSearchTitle('Watch Inception online free HD')).toBe('Inception');
    expect(guessSearchTitle('Inception ganzer Film deutsch kostenlos')).toBe('Inception');
  });

  it('drops a bare year and bracketed asides', () => {
    expect(guessSearchTitle('Inception (2010)')).toBe('Inception');
    expect(guessSearchTitle('Inception [1080p WEB-DL]')).toBe('Inception');
  });

  it('leaves a year that is part of the name alone', () => {
    // Only a parenthesised year is treated as noise.
    expect(guessSearchTitle('Blade Runner 2049')).toBe('Blade Runner 2049');
  });

  it('handles nothing to work with', () => {
    expect(guessSearchTitle(null)).toBe('');
    expect(guessSearchTitle('')).toBe('');
    expect(guessSearchTitle('   ')).toBe('');
  });
});
