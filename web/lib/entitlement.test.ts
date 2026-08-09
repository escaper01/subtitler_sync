import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { grant, grantTrial, isEntitled, LIFETIME_ENDS_AT, recompute, revoke } from '@/lib/entitlement';

/**
 * Entitlement behaviour, against a real database.
 *
 * Skipped unless `DB=1`, following the same opt-in convention as the live subtitlecat
 * test — it needs Docker up and the migrations applied:
 *
 *   npm run db:up && DB=1 npm test
 *
 * These are the rules money depends on. Stacking that silently replaces instead of
 * extending, or a webhook retry that grants twice, are both invisible until someone is
 * either overcharged or given a year for free.
 */

const live = process.env.DB === '1';

const DAY = 24 * 60 * 60 * 1000;

/** A throwaway account per test, so runs cannot interfere with each other. */
async function makeUser(): Promise<{ id: string; email: string }> {
  const email = `test-${crypto.randomUUID()}@ent.test`;
  const user = await db.user.create({ data: { email }, select: { id: true, email: true } });
  return user;
}

async function entitledUntil(userId: string): Promise<Date | null> {
  const user = await db.user.findUnique({ where: { id: userId }, select: { entitledUntil: true } });
  return user?.entitledUntil ?? null;
}

describe.skipIf(!live)('entitlement, against Postgres', () => {
  beforeEach(async () => {
    // Leave real rows alone; only ever clear the throwaway accounts.
    await db.user.deleteMany({ where: { email: { endsWith: '@ent.test' } } });
  });

  afterAll(async () => {
    await db.user.deleteMany({ where: { email: { endsWith: '@ent.test' } } });
  });

  it('starts a first grant from now', async () => {
    const user = await makeUser();
    const before = Date.now();

    const result = await grant({
      userId: user.id,
      source: 'CODE',
      days: 30,
      dedupeKey: `code:${user.id}:first`,
    });

    expect(result.granted).toBe(true);
    const until = await entitledUntil(user.id);
    expect(until).not.toBeNull();
    // 30 days out, give or take the time the test took.
    expect(until!.getTime() - before).toBeGreaterThan(29.9 * DAY);
    expect(until!.getTime() - before).toBeLessThan(30.1 * DAY);
  });

  it('stacks a new period onto the end of the current one', async () => {
    const user = await makeUser();

    await grantTrial(user.id, user.email); // 7 days
    const afterTrial = await entitledUntil(user.id);

    await grant({
      userId: user.id,
      source: 'CODE',
      days: 30,
      dedupeKey: `code:${user.id}:stack`,
    });
    const afterCode = await entitledUntil(user.id);

    // The month is added to what was left, not started from today: 37 days, not 30.
    const added = afterCode!.getTime() - afterTrial!.getTime();
    expect(added).toBeGreaterThan(29.9 * DAY);
    expect(added).toBeLessThan(30.1 * DAY);
  });

  it('starts from now again once the previous period has lapsed', async () => {
    const user = await makeUser();

    // A period that ended yesterday.
    await db.entitlement.create({
      data: {
        userId: user.id,
        source: 'CODE',
        startsAt: new Date(Date.now() - 31 * DAY),
        endsAt: new Date(Date.now() - 1 * DAY),
        dedupeKey: `code:${user.id}:lapsed`,
      },
    });
    await db.$transaction(async (tx) => recompute(tx, user.id));

    const before = Date.now();
    await grant({ userId: user.id, source: 'CODE', days: 30, dedupeKey: `code:${user.id}:renew` });

    // Not backdated onto the expired period — that would waste a day of what was bought.
    const until = await entitledUntil(user.id);
    expect(until!.getTime() - before).toBeGreaterThan(29.9 * DAY);
  });

  it('refuses a duplicate dedupeKey instead of granting twice', async () => {
    const user = await makeUser();
    const key = `patreon:member-1:2026-08-01`;

    const first = await grant({ userId: user.id, source: 'PATREON', days: 30, dedupeKey: key });
    const replay = await grant({ userId: user.id, source: 'PATREON', days: 30, dedupeKey: key });

    expect(first.granted).toBe(true);
    expect(replay).toEqual({ granted: false, reason: 'duplicate' });
    expect(await db.entitlement.count({ where: { userId: user.id } })).toBe(1);
  });

  it('grants the trial once per email, even to a rebuilt account', async () => {
    const user = await makeUser();
    expect((await grantTrial(user.id, user.email)).granted).toBe(true);

    // Delete the account and sign up again with the same address.
    await db.user.delete({ where: { id: user.id } });
    const reborn = await db.user.create({
      data: { email: user.email },
      select: { id: true },
    });

    const second = await grantTrial(reborn.id, user.email);
    expect(second).toEqual({ granted: false, reason: 'duplicate' });
    expect(await entitledUntil(reborn.id)).toBeNull();
  });

  it('drops back to the next-furthest period when one is revoked', async () => {
    const user = await makeUser();

    await grant({ userId: user.id, source: 'CODE', days: 10, dedupeKey: `code:${user.id}:short` });
    const long = await db.entitlement.create({
      data: {
        userId: user.id,
        source: 'ADMIN',
        endsAt: new Date(Date.now() + 400 * DAY),
        dedupeKey: `admin:${user.id}:long`,
      },
    });
    await db.$transaction(async (tx) => recompute(tx, user.id));
    expect((await entitledUntil(user.id))!.getTime()).toBeGreaterThan(Date.now() + 399 * DAY);

    await revoke(long.id);

    // Back to the ten-day grant, not to nothing — the ledger still holds it.
    const until = await entitledUntil(user.id);
    expect(until!.getTime()).toBeLessThan(Date.now() + 11 * DAY);
    expect(until!.getTime()).toBeGreaterThan(Date.now());
  });

  it('treats lifetime as entitled', async () => {
    const user = await makeUser();
    await grant({
      userId: user.id,
      source: 'ADMIN',
      lifetime: true,
      dedupeKey: `admin:${user.id}:forever`,
    });

    expect((await entitledUntil(user.id))!.getTime()).toBe(LIFETIME_ENDS_AT.getTime());
    expect(isEntitled({ status: 'ACTIVE', entitledUntil: LIFETIME_ENDS_AT })).toBe(true);
  });

  it('refuses a banned user however long their period runs', async () => {
    expect(isEntitled({ status: 'BANNED', entitledUntil: LIFETIME_ENDS_AT })).toBe(false);
    expect(isEntitled({ status: 'ACTIVE', entitledUntil: null })).toBe(false);
    expect(isEntitled({ status: 'ACTIVE', entitledUntil: new Date(Date.now() - 1000) })).toBe(false);
  });
});
