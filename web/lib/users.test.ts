import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { onSignIn } from '@/lib/users';
import { isEntitled, trialDays, trialKey } from '@/lib/entitlement';

/**
 * What sign-in does to the database. Opt-in behind `DB=1` — see entitlement.test.ts.
 *
 * The OAuth round trip itself needs a browser, but everything that matters happens in
 * `onSignIn`: an account appears, a first-timer gets their trial, and anything already
 * paid for is handed over.
 */

const live = process.env.DB === '1';
const DAY = 24 * 60 * 60 * 1000;

function address(): string {
  return `test-${crypto.randomUUID()}@signin.test`;
}

async function cleanup(): Promise<void> {
  const users = await db.user.findMany({
    where: { email: { endsWith: '@signin.test' } },
    select: { email: true },
  });
  await db.trialClaim.deleteMany({
    where: { emailHash: { in: users.map((user) => trialKey(user.email)) } },
  });
  await db.user.deleteMany({ where: { email: { endsWith: '@signin.test' } } });
  await db.pendingGrant.deleteMany({ where: { email: { endsWith: '@signin.test' } } });
}

describe.skipIf(!live)('sign-in', () => {
  beforeEach(cleanup);
  afterAll(cleanup);

  it('creates the account and grants the trial', async () => {
    const email = address();
    const { id } = await onSignIn({ email, name: 'Test Person' });

    const user = await db.user.findUniqueOrThrow({
      where: { id },
      select: { email: true, name: true, status: true, entitledUntil: true, entitlementSource: true },
    });

    expect(user.email).toBe(email);
    expect(user.status).toBe('ACTIVE');
    expect(user.entitlementSource).toBe('TRIAL');
    expect(isEntitled(user)).toBe(true);

    const left = user.entitledUntil!.getTime() - Date.now();
    expect(left).toBeGreaterThan((trialDays() - 0.1) * DAY);
    expect(left).toBeLessThan((trialDays() + 0.1) * DAY);
  });

  it('lowercases the address, so one person is one account', async () => {
    const email = address();
    const first = await onSignIn({ email: email.toUpperCase() });
    const second = await onSignIn({ email });

    expect(second.id).toBe(first.id);
    expect(await db.user.count({ where: { email: { endsWith: '@signin.test' } } })).toBe(1);
  });

  it('does not extend the trial on every later sign-in', async () => {
    const email = address();
    const { id } = await onSignIn({ email });
    const afterFirst = (await db.user.findUniqueOrThrow({ where: { id } })).entitledUntil;

    await onSignIn({ email });
    await onSignIn({ email });
    const afterThird = (await db.user.findUniqueOrThrow({ where: { id } })).entitledUntil;

    expect(afterThird!.getTime()).toBe(afterFirst!.getTime());
    expect(await db.entitlement.count({ where: { userId: id } })).toBe(1);
  });

  it('hands over a payment that arrived before the account existed', async () => {
    const email = address();

    // What the Patreon webhook leaves behind when it knows the address but not the person.
    await db.pendingGrant.create({
      data: {
        email,
        externalId: 'patreon-member-test',
        days: 30,
        dedupeKey: `patreon:test:${crypto.randomUUID()}`,
        payload: {},
      },
    });

    const { id } = await onSignIn({ email });
    const user = await db.user.findUniqueOrThrow({
      where: { id },
      select: { status: true, entitledUntil: true },
    });

    // Trial plus the waiting month, stacked: ~37 days, not 30 and not 7.
    const left = user.entitledUntil!.getTime() - Date.now();
    expect(left).toBeGreaterThan((trialDays() + 29.9) * DAY);
    expect(isEntitled(user)).toBe(true);

    const pending = await db.pendingGrant.findFirstOrThrow({ where: { email } });
    expect(pending.status).toBe('CLAIMED');
    expect(pending.claimedByUserId).toBe(id);
  });

  it('does not re-claim a grant that was already claimed', async () => {
    const email = address();
    await db.pendingGrant.create({
      data: {
        email,
        externalId: 'patreon-member-test-2',
        days: 30,
        dedupeKey: `patreon:test:${crypto.randomUUID()}`,
        payload: {},
      },
    });

    const { id } = await onSignIn({ email });
    const afterFirst = (await db.user.findUniqueOrThrow({ where: { id } })).entitledUntil;

    await onSignIn({ email });
    const afterSecond = (await db.user.findUniqueOrThrow({ where: { id } })).entitledUntil;

    expect(afterSecond!.getTime()).toBe(afterFirst!.getTime());
  });
});
