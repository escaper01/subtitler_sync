import { describe, expect, it } from 'vitest';
import { callerSubjects, hashIp, installOf } from '@/lib/callerId';

/**
 * The rate limiter is the only thing in front of the search API now, and it can only
 * refuse what it can name. These tests cover the ways a caller could end up unnamed — and
 * therefore unlimited — which is the failure that matters here.
 */

function req(headers: Record<string, string>): Request {
  return new Request('https://example.com/api/search?q=x', { headers });
}

describe('installOf', () => {
  it('reads the extension header', () => {
    expect(installOf(req({ 'x-subtitler-install': 'abc123' }))).toBe('abc123');
  });

  it('bounds the value, because it is chosen by the caller and becomes a database key', () => {
    const long = 'a'.repeat(500);
    expect(installOf(req({ 'x-subtitler-install': long }))).toHaveLength(64);
  });

  it('treats an empty or whitespace header as absent', () => {
    expect(installOf(req({ 'x-subtitler-install': '' }))).toBeNull();
    expect(installOf(req({ 'x-subtitler-install': '   ' }))).toBeNull();
    expect(installOf(req({}))).toBeNull();
  });
});

describe('hashIp', () => {
  it('prefers the first x-forwarded-for entry — the rest are proxies that appended themselves', () => {
    const hash = hashIp(req({ 'x-forwarded-for': '1.2.3.4, 10.0.0.1, 10.0.0.2' }));
    expect(hash).toBe(hashIp(req({ 'x-forwarded-for': '1.2.3.4' })));
  });

  it('falls back to x-real-ip', () => {
    expect(hashIp(req({ 'x-real-ip': '5.6.7.8' }))).not.toBeNull();
  });

  it('is stable for one address and different for another', () => {
    const a = hashIp(req({ 'x-real-ip': '1.1.1.1' }));
    const b = hashIp(req({ 'x-real-ip': '1.1.1.2' }));
    expect(a).toBe(hashIp(req({ 'x-real-ip': '1.1.1.1' })));
    expect(a).not.toBe(b);
  });

  it('never returns the address itself', () => {
    expect(hashIp(req({ 'x-real-ip': '9.9.9.9' }))).not.toContain('9.9.9.9');
  });

  it('is null when there is no address header at all', () => {
    expect(hashIp(req({}))).toBeNull();
  });
});

describe('callerSubjects', () => {
  it('puts a caller with no install id into one shared bucket, not past the limiter', () => {
    // This is the case worth having a test for. Treating a missing header as "unlimited"
    // would make the limiter opt-in, which is the same as not having one — stripping the
    // header would be the whole bypass.
    expect(callerSubjects(req({})).install).toBe('anonymous');
    expect(callerSubjects(req({ 'x-subtitler-install': '  ' })).install).toBe('anonymous');
  });

  it('still limits on the install id when there is no address to hash', () => {
    const subjects = callerSubjects(req({ 'x-subtitler-install': 'abc' }));
    expect(subjects.install).toBe('abc');
    expect(subjects.ip).toBeNull();
  });
});
