import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { activate, hashKey, hintOf, issueLicense, lookupLicense, normalizeKey } from '@/lib/license';

/**
 * Licence keys and the device limit, against a real database.
 *
 * Skipped unless `DB=1`, like the entitlement tests:
 *
 *   npm run db:up && DB=1 npm test
 *
 * The concurrency case here is the reason this file exists. A plain transaction around
 * count-then-insert *looks* correct and passes every sequential test, while letting two
 * devices take the same last seat — which is the difference between a licence limit and a
 * suggestion. It only ever shows up under simultaneous requests.
 */

const live = process.env.DB === '1';

async function makeLicense(limit: number): Promise<{ id: string; key: string }> {
  const email = `test-${crypto.randomUUID()}@lic.test`;
  const user = await db.user.create({ data: { email }, select: { id: true } });
  const key = crypto.randomUUID();

  const license = await issueLicense({
    key,
    userId: user.id,
    source: 'ADMIN',
    activationLimit: limit,
  });

  return { id: license.id, key };
}

describe.skipIf(!live)('licences, against Postgres', () => {
  beforeEach(async () => {
    await db.user.deleteMany({ where: { email: { endsWith: '@lic.test' } } });
  });

  afterAll(async () => {
    await db.user.deleteMany({ where: { email: { endsWith: '@lic.test' } } });
    await db.$disconnect();
  });

  it('recognises a key it issued, and not one it did not', async () => {
    const { key } = await makeLicense(2);

    const found = await lookupLicense(key);
    expect(found.ok).toBe(true);

    const stranger = await lookupLicense(crypto.randomUUID());
    expect(stranger).toEqual({ ok: false, reason: 'unknown' });

    expect(await lookupLicense(null)).toEqual({ ok: false, reason: 'missing' });
    expect(await lookupLicense('   ')).toEqual({ ok: false, reason: 'missing' });
  });

  it('ignores the whitespace people paste out of emails', async () => {
    const { key } = await makeLicense(2);

    const padded = await lookupLicense(`  ${key}\n`);
    expect(padded.ok).toBe(true);
  });

  it('stops recognising a revoked key', async () => {
    const { id, key } = await makeLicense(2);
    await db.license.update({ where: { id }, data: { status: 'REVOKED' } });

    expect(await lookupLicense(key)).toEqual({ ok: false, reason: 'revoked' });
  });

  it('lets a known device back in without taking a second seat', async () => {
    const { id } = await makeLicense(1);

    expect(await activate(id, 'same-laptop', 1)).toEqual({ ok: true });
    expect(await activate(id, 'same-laptop', 1)).toEqual({ ok: true });

    expect(await db.licenseActivation.count({ where: { licenseId: id } })).toBe(1);
  });

  it('refuses a device beyond the limit', async () => {
    const { id } = await makeLicense(2);

    expect(await activate(id, 'laptop', 2)).toEqual({ ok: true });
    expect(await activate(id, 'desktop', 2)).toEqual({ ok: true });
    expect(await activate(id, 'phone', 2)).toEqual({ ok: false, reason: 'device_limit' });
  });

  it('gives the last seat to exactly one of two simultaneous devices', async () => {
    const { id } = await makeLicense(1);

    // Both start before either commits. Under READ COMMITTED each would count zero seats
    // taken and insert, since their install ids differ and the unique constraint only
    // catches a device racing itself. The row lock in `activate` is what stops it.
    const results = await Promise.all([activate(id, 'race-a', 1), activate(id, 'race-b', 1)]);

    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(await db.licenseActivation.count({ where: { licenseId: id } })).toBe(1);
  });

  it('holds the line when many devices arrive at once', async () => {
    const { id } = await makeLicense(2);

    const results = await Promise.all(
      Array.from({ length: 8 }, (_, i) => activate(id, `device-${i}`, 2)),
    );

    expect(results.filter((r) => r.ok)).toHaveLength(2);
    expect(await db.licenseActivation.count({ where: { licenseId: id } })).toBe(2);
  });

  it('lets an extension that sends no install id through', async () => {
    // Older builds predate the header. Locking them out mid-rollout would be worse than
    // an unmetered device until they update.
    const { id } = await makeLicense(1);
    expect(await activate(id, null, 1)).toEqual({ ok: true });
    expect(await db.licenseActivation.count({ where: { licenseId: id } })).toBe(0);
  });
});

describe('key handling', () => {
  it('hashes to something other than the key, and stably', () => {
    const key = 'ABCD-1234-EFGH-5678';
    expect(hashKey(key)).not.toContain(key);
    expect(hashKey(key)).toBe(hashKey(`  ${key} `));
    expect(hashKey(key)).not.toBe(hashKey('ABCD-1234-EFGH-5679'));
  });

  it('keeps a hint short enough to be useless', () => {
    expect(hintOf('ABCD-1234-EFGH-5678')).toBe('ABCD-123');
    expect(normalizeKey('  x  ')).toBe('x');
  });
});
