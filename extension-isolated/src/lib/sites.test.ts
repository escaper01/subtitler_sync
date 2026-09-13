import { describe, expect, it } from 'vitest';
import { hostMatches, isAllowed, normalizeDomain } from '@/lib/sites';

describe('normalizeDomain', () => {
  it('accepts a bare domain', () => {
    expect(normalizeDomain('kinoger.com')).toBe('kinoger.com');
    expect(normalizeDomain('  Kinoger.COM  ')).toBe('kinoger.com');
  });

  it('extracts the host from a pasted URL', () => {
    expect(normalizeDomain('https://hdfilme.to/movie/123?x=1')).toBe('hdfilme.to');
    expect(normalizeDomain('http://media.ccc.de:8080/')).toBe('media.ccc.de');
  });

  it('strips path, port, wildcard and leading dot', () => {
    expect(normalizeDomain('aniworld.to/serie/x')).toBe('aniworld.to');
    expect(normalizeDomain('aniworld.to:443')).toBe('aniworld.to');
    expect(normalizeDomain('*.aniworld.to')).toBe('aniworld.to');
    expect(normalizeDomain('.aniworld.to.')).toBe('aniworld.to');
  });

  it('drops a www prefix, since matching is by suffix anyway', () => {
    expect(normalizeDomain('www.serienstream.to')).toBe('serienstream.to');
    expect(normalizeDomain('https://www.serienstream.to')).toBe('serienstream.to');
  });

  it('keeps single-label hosts, so the local test harness can be allowed', () => {
    expect(normalizeDomain('localhost')).toBe('localhost');
    expect(normalizeDomain('http://localhost:5173/test/local.html')).toBe('localhost');
    expect(normalizeDomain('127.0.0.1')).toBe('127.0.0.1');
  });

  it('rejects anything that is not a host', () => {
    expect(normalizeDomain('')).toBeNull();
    expect(normalizeDomain('   ')).toBeNull();
    expect(normalizeDomain('not a domain')).toBeNull();
    expect(normalizeDomain('-bad.com')).toBeNull();
    expect(normalizeDomain('http://')).toBeNull();
  });
});

describe('hostMatches', () => {
  it('matches the domain itself and its subdomains', () => {
    expect(hostMatches('kinoger.com', 'kinoger.com')).toBe(true);
    expect(hostMatches('www.kinoger.com', 'kinoger.com')).toBe(true);
    expect(hostMatches('cdn.eu.kinoger.com', 'kinoger.com')).toBe(true);
  });

  it('does not match a suffix that is not a domain boundary', () => {
    expect(hostMatches('notkinoger.com', 'kinoger.com')).toBe(false);
    expect(hostMatches('kinoger.com.evil.net', 'kinoger.com')).toBe(false);
  });

  it('does not match upwards from a subdomain rule', () => {
    expect(hostMatches('ccc.de', 'media.ccc.de')).toBe(false);
    expect(hostMatches('media.ccc.de', 'media.ccc.de')).toBe(true);
  });
});

describe('isAllowed', () => {
  const sites = ['hdfilme.to', 'media.ccc.de'];

  it('allows a listed site and its subdomains', () => {
    expect(isAllowed('hdfilme.to', sites)).toBe(true);
    expect(isAllowed('www.hdfilme.to', sites)).toBe(true);
  });

  it('blocks everything else, including an unknown host and no host at all', () => {
    expect(isAllowed('youtube.com', sites)).toBe(false);
    expect(isAllowed(null, sites)).toBe(false);
    expect(isAllowed('', sites)).toBe(false);
    expect(isAllowed('hdfilme.to', [])).toBe(false);
  });
});
