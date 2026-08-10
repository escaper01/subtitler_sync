import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { createCode, generateCode, normalizeCode, redeemCode } from '@/lib/codes';

/**
 * Redeemable codes. Opt-in behind `DB=1` — see entitlement.test.ts.
 *
 * The concurrency case is the reason this file exists. Over-redemption cannot be seen by
 * reading the code and does not show up in single-threaded tests; it appears only when two
 * people redeem the last use of a shared code in the same instant.
 */

const live = process.env.DB === '1';
const DAY = 24 * 60 * 60 * 1000;

async function makeUser(): Promise<{ id: string; email: string }> {
  const email = `test-${crypto.randomUUID()}@codes.test`;
  return db.user.create({ data: { email }, select: { id: true, email: true } });
}

async function cleanup(): Promise<void> {
  await db.user.deleteMany({ where: { email: { endsWith: '@codes.test' } } });
  await db.subscriptionCode.deleteMany({ where: { note: { startsWith: 'test:' } } });
}

describe('code formatting', () => {
  it('generates a grouped code from an unambiguous alphabet', () => {
    for (let i = 0; i < 50; i++) {
      const code = generateCode();
      expect(code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
      // The characters people misread are the ones to leave out.
      expect(code).not.toMatch(/[O0I1U]/);
    }
  });

  it('accepts what a human actually types', () => {
    const code = 'ABCD-EFGH-JKLM';
    expect(normalizeCode('abcd-efgh-jklm')).toBe(code);
    expect(normalizeCode('ABCDEFGHJKLM')).toBe(code);
    expect(normalizeCode('  abcd efgh jklm  ')).toBe(code);
    expect(normalizeCode('abcd_efgh_jklm')).toBe(code);
  });
});

describe.skipIf(!live)('redeeming, against Postgres', () => {
  beforeEach(cleanup);
  afterAll(cleanup);

  it('grants the days and records the redemption', async () => {
    const user = await makeUser();
    const code = await createCode({ days: 30, note: 'test:basic' });

    const result = await redeemCode(code.code, user.id);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.days).toBe(30);

    const after = await db.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(after.entitledUntil!.getTime() - Date.now()).toBeGreaterThan(29.9 * DAY);
    expect(after.entitlementSource).toBe('CODE');
    expect(await db.codeRedemption.count({ where: { codeId: code.id } })).toBe(1);
  });

  it('accepts the code however it was typed', async () => {
    const user = await makeUser();
    const code = await createCode({ days: 7, note: 'test:format' });

    const result = await redeemCode(code.code.toLowerCase().replace(/-/g, ' '), user.id);
    expect(result.ok).toBe(true);
  });

  it('refuses unknown, disabled and expired codes', async () => {
    const user = await makeUser();

    expect(await redeemCode('ZZZZ-ZZZZ-ZZZZ', user.id)).toEqual({ ok: false, reason: 'unknown' });

    const disabled = await createCode({ days: 30, note: 'test:disabled' });
    await db.subscriptionCode.update({
      where: { id: disabled.id },
      data: { disabledAt: new Date() },
    });
    expect(await redeemCode(disabled.code, user.id)).toEqual({ ok: false, reason: 'expired' });

    const lapsed = await createCode({
      days: 30,
      note: 'test:lapsed',
      expiresAt: new Date(Date.now() - 1000),
    });
    expect(await redeemCode(lapsed.code, user.id)).toEqual({ ok: false, reason: 'expired' });
  });

  it('refuses the same person redeeming twice, and does not spend a use', async () => {
    const user = await makeUser();
    const code = await createCode({ days: 30, maxRedemptions: 5, note: 'test:twice' });

    expect((await redeemCode(code.code, user.id)).ok).toBe(true);
    expect(await redeemCode(code.code, user.id)).toEqual({
      ok: false,
      reason: 'already_redeemed',
    });

    // The rollback matters: a refused second attempt must not burn one of the five.
    const after = await db.subscriptionCode.findUniqueOrThrow({ where: { id: code.id } });
    expect(after.redemptionCount).toBe(1);
  });

  it('lets exactly one of two simultaneous redemptions win', async () => {
    const [a, b] = await Promise.all([makeUser(), makeUser()]);
    const code = await createCode({ days: 30, maxRedemptions: 1, note: 'test:race' });

    // Both fired at once against the last remaining use. A read-then-write would let both
    // through and hand out two subscriptions for one payment.
    const results = await Promise.all([
      redeemCode(code.code, a.id),
      redeemCode(code.code, b.id),
    ]);

    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok)).toHaveLength(1);

    const after = await db.subscriptionCode.findUniqueOrThrow({ where: { id: code.id } });
    expect(after.redemptionCount).toBe(1);
    expect(await db.codeRedemption.count({ where: { codeId: code.id } })).toBe(1);
  });

  it('honours maxRedemptions across many people', async () => {
    const code = await createCode({ days: 30, maxRedemptions: 3, note: 'test:campaign' });
    const users = await Promise.all([1, 2, 3, 4, 5].map(() => makeUser()));

    const results = await Promise.all(users.map((user) => redeemCode(code.code, user.id)));

    expect(results.filter((r) => r.ok)).toHaveLength(3);
    expect(results.filter((r) => !r.ok && r.reason === 'used_up')).toHaveLength(2);
    expect(
      (await db.subscriptionCode.findUniqueOrThrow({ where: { id: code.id } })).redemptionCount,
    ).toBe(3);
  });

  it('stacks onto whatever the user already had', async () => {
    const user = await makeUser();
    await db.entitlement.create({
      data: {
        userId: user.id,
        source: 'TRIAL',
        endsAt: new Date(Date.now() + 5 * DAY),
        dedupeKey: `trial:${user.id}:test`,
      },
    });
    await db.user.update({
      where: { id: user.id },
      data: { entitledUntil: new Date(Date.now() + 5 * DAY) },
    });

    const code = await createCode({ days: 30, note: 'test:stack' });
    await redeemCode(code.code, user.id);

    // 5 days left plus a 30-day code is 35, not 30.
    const after = await db.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(after.entitledUntil!.getTime() - Date.now()).toBeGreaterThan(34.9 * DAY);
  });
});
