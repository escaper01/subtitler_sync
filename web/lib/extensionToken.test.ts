import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { hashToken, lookupToken, mintToken, parseToken } from '@/lib/extensionToken';

/** The secret half, extracted the same way the server does it. */
function secretOf(token: string): string {
  return parseToken(token)!.secret;
}

/**
 * The extension credential. Opt-in behind `DB=1` — see entitlement.test.ts.
 *
 * This is the thing standing between a stranger and a paid feature, so the cases that
 * matter are the refusals, not the happy path.
 */

const live = process.env.DB === '1';

async function makeUser(): Promise<{ id: string; email: string }> {
  const email = `test-${crypto.randomUUID()}@token.test`;
  return db.user.create({ data: { email }, select: { id: true, email: true } });
}

async function cleanup(): Promise<void> {
  await db.user.deleteMany({ where: { email: { endsWith: '@token.test' } } });
}

describe('parseToken', () => {
  it('accepts our shape and rejects everything else', () => {
    expect(parseToken('stx_abc_secret')).toEqual({ id: 'abc', secret: 'secret' });
    expect(parseToken('  stx_abc_secret  ')).toEqual({ id: 'abc', secret: 'secret' });

    for (const bad of ['', 'nonsense', 'stx_abc', 'stx__secret', 'stx_abc_', 'jwt_abc_x']) {
      expect(parseToken(bad), bad).toBeNull();
    }
  });

  it('keeps a secret that contains underscores intact', () => {
    // base64url includes '_', so roughly half of all real secrets contain one. Splitting
    // on every underscore truncated them, which made sign-in fail at random rather than
    // consistently — the worst way for this to be wrong.
    expect(parseToken('stx_abc_aa_bb_cc')).toEqual({ id: 'abc', secret: 'aa_bb_cc' });
    expect(parseToken('stx_abc_-_-')).toEqual({ id: 'abc', secret: '-_-' });
  });
});

describe.skipIf(!live)('extension tokens, against Postgres', () => {
  beforeEach(cleanup);
  afterAll(cleanup);

  it('mints a token that validates back to its owner', async () => {
    const user = await makeUser();
    const { token } = await mintToken(user.id, 'Chrome on Windows');

    const result = await lookupToken(token);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.userId).toBe(user.id);
      expect(result.email).toBe(user.email);
      expect(result.status).toBe('ACTIVE');
    }
  });

  it('never stores the secret itself', async () => {
    const user = await makeUser();
    const { token } = await mintToken(user.id);
    const secret = secretOf(token);

    const row = await db.extensionToken.findFirstOrThrow({ where: { userId: user.id } });
    expect(row.tokenHash).not.toContain(secret);
    expect(row.tokenHash).toBe(hashToken(secret));
    // And nothing anywhere on the row is the raw token.
    expect(JSON.stringify(row)).not.toContain(secret);
  });

  it('refuses a token whose id and secret disagree', async () => {
    const userA = await makeUser();
    const userB = await makeUser();
    const a = await mintToken(userA.id);
    const b = await mintToken(userB.id);

    // B's id bolted onto A's secret — the id must not be decoration.
    const frankenstein = `stx_${parseToken(b.token)!.id}_${secretOf(a.token)}`;
    expect(await lookupToken(frankenstein)).toEqual({ ok: false, reason: 'unknown' });
  });

  it('refuses malformed, unknown, revoked and expired tokens', async () => {
    const user = await makeUser();

    expect(await lookupToken(null)).toEqual({ ok: false, reason: 'malformed' });
    expect(await lookupToken('garbage')).toEqual({ ok: false, reason: 'malformed' });
    expect(await lookupToken('stx_nope_nothing')).toEqual({ ok: false, reason: 'unknown' });

    const revoked = await mintToken(user.id);
    await db.extensionToken.updateMany({
      where: { userId: user.id },
      data: { revokedAt: new Date() },
    });
    expect(await lookupToken(revoked.token)).toEqual({ ok: false, reason: 'unknown' });

    const expired = await mintToken(user.id);
    await db.extensionToken.update({
      where: { tokenHash: hashToken(secretOf(expired.token)) },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect(await lookupToken(expired.token)).toEqual({ ok: false, reason: 'expired' });
  });

  it('carries the owner’s access state, so the gate needs no second query', async () => {
    const user = await makeUser();
    const until = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await db.user.update({
      where: { id: user.id },
      data: { entitledUntil: until, entitlementSource: 'CODE' },
    });

    const { token } = await mintToken(user.id);
    const result = await lookupToken(token);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.entitledUntil?.getTime()).toBe(until.getTime());
      expect(result.entitlementSource).toBe('CODE');
    }
  });

  it('extends its own expiry as it is used', async () => {
    const user = await makeUser();
    const { token } = await mintToken(user.id);
    const hash = hashToken(secretOf(token));

    // Pretend it was last used two days ago and is close to lapsing.
    const soon = new Date(Date.now() + 60 * 60 * 1000);
    await db.extensionToken.update({
      where: { tokenHash: hash },
      data: { lastUsedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), expiresAt: soon },
    });

    expect((await lookupToken(token)).ok).toBe(true);

    // The bump is fire-and-forget, so give it a moment to land.
    await new Promise((resolve) => setTimeout(resolve, 250));
    const row = await db.extensionToken.findUniqueOrThrow({ where: { tokenHash: hash } });
    expect(row.expiresAt.getTime()).toBeGreaterThan(soon.getTime());
  });
});
