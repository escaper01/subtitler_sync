import { createHmac } from 'node:crypto';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { handleEvent, verifySignature } from '@/lib/patreon';

/**
 * Patreon deliveries.
 *
 * The signature tests need no database. The rest are opt-in behind `DB=1` — see
 * entitlement.test.ts.
 */

const live = process.env.DB === '1';
const SECRET = 'test-webhook-secret';

function sign(body: string): string {
  return createHmac('md5', SECRET).update(body).digest('hex');
}

function payload(overrides: Record<string, unknown> = {}, memberId = 'member-1') {
  return {
    data: {
      id: memberId,
      attributes: {
        patron_status: 'active_patron',
        last_charge_status: 'Paid',
        last_charge_date: '2026-08-01T00:00:00.000Z',
        currently_entitled_amount_cents: 500,
        ...overrides,
      },
    },
  };
}

async function cleanup(): Promise<void> {
  await db.pendingGrant.deleteMany({ where: { externalId: { startsWith: 'member-' } } });
  await db.patreonMember.deleteMany({ where: { memberId: { startsWith: 'member-' } } });
  await db.subscriptionCode.deleteMany({ where: { note: { startsWith: 'Patreon member-' } } });
  await db.user.deleteMany({ where: { email: { endsWith: '@patreon.test' } } });
}

describe('verifySignature', () => {
  const original = process.env.PATREON_WEBHOOK_SECRET;

  // In a hook, not in the describe body: the body runs at collection time, so anything
  // done there happens before — and is undone before — a single `it` gets to run.
  beforeEach(() => {
    process.env.PATREON_WEBHOOK_SECRET = SECRET;
  });

  afterAll(() => {
    if (original === undefined) delete process.env.PATREON_WEBHOOK_SECRET;
    else process.env.PATREON_WEBHOOK_SECRET = original;
  });

  it('accepts a correctly signed body', () => {
    const body = JSON.stringify(payload());
    expect(verifySignature(body, sign(body))).toBe(true);
    // Patreon sends lowercase hex; be forgiving about case, strict about everything else.
    expect(verifySignature(body, sign(body).toUpperCase())).toBe(true);
  });

  it('rejects a tampered body, a wrong secret and a missing signature', () => {
    const body = JSON.stringify(payload());
    const signature = sign(body);

    expect(verifySignature(`${body} `, signature)).toBe(false);
    expect(verifySignature(body, null)).toBe(false);
    expect(verifySignature(body, 'nonsense')).toBe(false);
    expect(verifySignature(body, createHmac('md5', 'wrong').update(body).digest('hex'))).toBe(
      false,
    );
  });

  it('rejects everything when no secret is configured', () => {
    process.env.PATREON_WEBHOOK_SECRET = '';
    const body = JSON.stringify(payload());
    expect(verifySignature(body, sign(body))).toBe(false);
    process.env.PATREON_WEBHOOK_SECRET = SECRET;
  });

  if (original === undefined) delete process.env.PATREON_WEBHOOK_SECRET;
});

describe.skipIf(!live)('handling deliveries, against Postgres', () => {
  beforeEach(cleanup);
  afterAll(cleanup);

  it('grants straight away when the email matches an account', async () => {
    const email = `patron-${crypto.randomUUID()}@patreon.test`;
    const user = await db.user.create({ data: { email }, select: { id: true } });

    const outcome = await handleEvent('members:pledge:create', payload({ email }));

    expect(outcome).toMatchObject({ handled: true, action: 'granted' });
    const after = await db.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(after.entitlementSource).toBe('PATREON');
    expect(after.entitledUntil!.getTime()).toBeGreaterThan(Date.now());
  });

  it('leaves a claimable code when Patreon sends no email at all', async () => {
    // The normal case without the campaigns.members[email] scope.
    const outcome = await handleEvent('members:pledge:create', payload({}, 'member-noemail'));

    expect(outcome).toMatchObject({ handled: true, action: 'pending' });

    const pending = await db.pendingGrant.findFirstOrThrow({
      where: { externalId: 'member-noemail' },
      include: { code: true },
    });
    expect(pending.status).toBe('PENDING');
    expect(pending.email).toBeNull();
    // A payment must never evaporate: there is always something to send them.
    expect(pending.code?.code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  });

  it('leaves a claimable code when the address has no account yet', async () => {
    const email = `stranger-${crypto.randomUUID()}@patreon.test`;
    const outcome = await handleEvent('members:pledge:create', payload({ email }, 'member-new'));

    expect(outcome).toMatchObject({ handled: true, action: 'pending' });
    const pending = await db.pendingGrant.findFirstOrThrow({ where: { externalId: 'member-new' } });
    expect(pending.email).toBe(email);
  });

  it('does not grant twice for a replayed delivery', async () => {
    const email = `patron-${crypto.randomUUID()}@patreon.test`;
    const user = await db.user.create({ data: { email }, select: { id: true } });

    await handleEvent('members:pledge:create', payload({ email }, 'member-replay'));
    const first = (await db.user.findUniqueOrThrow({ where: { id: user.id } })).entitledUntil;

    // The same delivery again — same member, same charge date.
    await handleEvent('members:pledge:create', payload({ email }, 'member-replay'));
    const second = (await db.user.findUniqueOrThrow({ where: { id: user.id } })).entitledUntil;

    expect(second!.getTime()).toBe(first!.getTime());
    expect(await db.entitlement.count({ where: { userId: user.id } })).toBe(1);
  });

  it('extends on renewal, because the charge date is new', async () => {
    const email = `patron-${crypto.randomUUID()}@patreon.test`;
    const user = await db.user.create({ data: { email }, select: { id: true } });

    await handleEvent('members:pledge:create', payload({ email }, 'member-renew'));
    const first = (await db.user.findUniqueOrThrow({ where: { id: user.id } })).entitledUntil;

    await handleEvent(
      'members:pledge:update',
      payload({ email, last_charge_date: '2026-09-01T00:00:00.000Z' }, 'member-renew'),
    );
    const second = (await db.user.findUniqueOrThrow({ where: { id: user.id } })).entitledUntil;

    expect(second!.getTime()).toBeGreaterThan(first!.getTime());
  });

  it('marks a cancelled pledge inactive without taking back the paid period', async () => {
    const email = `patron-${crypto.randomUUID()}@patreon.test`;
    const user = await db.user.create({ data: { email }, select: { id: true } });

    await handleEvent('members:pledge:create', payload({ email }, 'member-cancel'));
    const before = (await db.user.findUniqueOrThrow({ where: { id: user.id } })).entitledUntil;

    const outcome = await handleEvent('members:pledge:delete', payload({ email }, 'member-cancel'));

    expect(outcome).toMatchObject({ handled: true, action: 'deactivated' });
    expect(
      (await db.patreonMember.findUniqueOrThrow({ where: { memberId: 'member-cancel' } })).active,
    ).toBe(false);

    // They paid for this month; they keep this month.
    const after = (await db.user.findUniqueOrThrow({ where: { id: user.id } })).entitledUntil;
    expect(after!.getTime()).toBe(before!.getTime());
  });

  it('ignores a pledge that has not been paid', async () => {
    const email = `patron-${crypto.randomUUID()}@patreon.test`;
    const user = await db.user.create({ data: { email }, select: { id: true } });

    const outcome = await handleEvent(
      'members:pledge:create',
      payload({ email, last_charge_status: 'Declined' }, 'member-declined'),
    );

    expect(outcome).toMatchObject({ handled: true, action: 'ignored' });
    expect((await db.user.findUniqueOrThrow({ where: { id: user.id } })).entitledUntil).toBeNull();
  });

  it('reports a payload with no member id rather than throwing', async () => {
    expect(await handleEvent('members:pledge:create', {})).toMatchObject({ handled: false });
  });
});
