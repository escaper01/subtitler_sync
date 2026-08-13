import { createHash } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { db } from '@/lib/db';

/**
 * Licence keys — the credential, replacing the old sign-in token.
 *
 * The extension never signs in, whatever the website does. A key is issued to the customer
 * — by us for a trial or an admin grant, or by a payment provider at checkout — they paste
 * it into the extension, and every request carries it. We see the key once, hash it, and
 * recognise it afterwards.
 *
 * **Existing and working are separate questions.** The key identifies its owner; whether
 * that owner may search comes from `User.entitledUntil`, exactly as before. So a lapsed
 * subscription leaves the key intact and simply stops opening the door, and renewing
 * revives the same key rather than issuing another.
 *
 * Hashed with SHA-256 rather than a slow KDF, for the same reason as the old token: the key
 * is high-entropy random from someone else's CSPRNG, so there is nothing to brute-force,
 * and a deliberately slow hash would land on every single API call.
 */

export function hashKey(key: string): string {
  return createHash('sha256').update(normalizeKey(key)).digest('hex');
}

/**
 * Trim and upper-case. Keys are UUID-shaped, and people paste them out of emails with
 * stray whitespace; neither should be the difference between working and not.
 */
export function normalizeKey(key: string): string {
  return key.trim();
}

/** The first characters, so a key is recognisable in the dashboard without being usable. */
export function hintOf(key: string): string {
  return normalizeKey(key).slice(0, 8);
}

export type LicenseLookup =
  | {
      ok: true;
      licenseId: string;
      userId: string;
      email: string;
      status: string;
      entitledUntil: Date | null;
      entitlementSource: string | null;
      activationLimit: number;
      /** How many devices are already using this key. */
      activations: number;
    }
  | { ok: false; reason: 'missing' | 'unknown' | 'revoked' };

/**
 * Find a licence and its owner's access, in one indexed read.
 *
 * This is the hot path — identity plus entitlement together, which is what the
 * denormalised `User.entitledUntil` buys.
 */
export async function lookupLicense(raw: string | null): Promise<LicenseLookup> {
  if (!raw || raw.trim().length === 0) return { ok: false, reason: 'missing' };

  const row = await db.license.findUnique({
    where: { keyHash: hashKey(raw) },
    select: {
      id: true,
      status: true,
      activationLimit: true,
      user: {
        select: {
          id: true,
          email: true,
          status: true,
          entitledUntil: true,
          entitlementSource: true,
        },
      },
      _count: { select: { activations: true } },
    },
  });

  if (!row) return { ok: false, reason: 'unknown' };
  if (row.status !== 'ACTIVE') return { ok: false, reason: 'revoked' };

  return {
    ok: true,
    licenseId: row.id,
    userId: row.user.id,
    email: row.user.email,
    status: row.user.status,
    entitledUntil: row.user.entitledUntil,
    entitlementSource: row.user.entitlementSource,
    activationLimit: row.activationLimit,
    activations: row._count.activations,
  };
}

export type ActivationResult = { ok: true } | { ok: false; reason: 'device_limit' };

/**
 * Record that a device is using this licence, and enforce the limit.
 *
 * The device is the extension's anonymous install id. A known device just refreshes its
 * timestamp; a new one takes a slot if there is room.
 *
 * The race matters, and a transaction alone does not settle it. Two browsers claiming the
 * last free slot both count zero under Postgres' default READ COMMITTED — neither sees the
 * other's uncommitted row — and both insert, because their install ids differ so the
 * `@@unique([licenseId, installId])` constraint has nothing to fire on. That constraint
 * only stops the *same* device racing itself.
 *
 * So the licence row is locked `FOR UPDATE` first. Claims against one key then queue behind
 * each other and the count is taken with the outcome already decided; claims against
 * different keys never touch. Verified by firing two devices at a one-seat licence.
 */
export async function activate(
  licenseId: string,
  installId: string | null,
  limit: number,
): Promise<ActivationResult> {
  // No install id means an older extension build that does not send one yet. Let it
  // through rather than locking out everyone mid-rollout; the limit starts applying as
  // soon as they update.
  if (!installId) return { ok: true };

  const existing = await db.licenseActivation.findUnique({
    where: { licenseId_installId: { licenseId, installId } },
    select: { id: true, lastSeenAt: true },
  });

  if (existing) {
    // Once a day is enough for "when was this device last used"; per request is a write
    // on every search for no extra information.
    if (Date.now() - existing.lastSeenAt.getTime() > 24 * 60 * 60 * 1000) {
      await db.licenseActivation
        .update({ where: { id: existing.id }, data: { lastSeenAt: new Date() } })
        .catch(() => {});
    }
    return { ok: true };
  }

  try {
    return await db.$transaction(async (tx) => {
      // Serialises every claim against this one licence. Must come before the count, or the
      // count is a snapshot taken while another transaction is mid-insert.
      await tx.$queryRaw`SELECT id FROM "License" WHERE id = ${licenseId} FOR UPDATE`;

      const taken = await tx.licenseActivation.count({ where: { licenseId } });
      if (taken >= limit) return { ok: false, reason: 'device_limit' } as const;

      await tx.licenseActivation.create({ data: { licenseId, installId } });
      return { ok: true } as const;
    });
  } catch (err) {
    // The unique constraint fired: another request registered this same device first,
    // which is a success from the caller's point of view.
    if (isUniqueViolation(err)) return { ok: true };
    throw err;
  }
}

/**
 * There is no self-healing recovery path at the moment.
 *
 * There used to be: a key we had no record of was checked against Lemon Squeezy once, and
 * if they vouched for it the rows were created on the spot. It was the most valuable thing
 * in this file, because a webhook that never arrives otherwise means a paying customer
 * whose key is refused and a support email as the only fix.
 *
 * It went with Lemon Squeezy, and it is worth rebuilding for whatever replaces them. What
 * it needs from a provider is one thing: an endpoint that answers "is this key real, and
 * whose is it". Any provider that issues its own licence keys has one. Until then, a key
 * we do not know is simply refused, and the gap has to be closed by hand from /admin.
 */

export interface IssueInput {
  key: string;
  userId: string;
  source: 'PURCHASE' | 'TRIAL' | 'ADMIN';
  externalId?: string | null;
  subscriptionId?: string | null;
  activationLimit?: number;
  note?: string;
}

/** Store a key we have issued or been told about. Idempotent on the key itself. */
export async function issueLicense(input: IssueInput) {
  const keyHash = hashKey(input.key);

  return db.license.upsert({
    where: { keyHash },
    update: {
      status: 'ACTIVE',
      externalId: input.externalId ?? undefined,
      subscriptionId: input.subscriptionId ?? undefined,
    },
    create: {
      keyHash,
      keyHint: hintOf(input.key),
      userId: input.userId,
      source: input.source,
      externalId: input.externalId ?? null,
      subscriptionId: input.subscriptionId ?? null,
      activationLimit: input.activationLimit ?? 2,
      note: input.note,
    },
  });
}

/** Bookkeeping, at most once a day per licence. Never awaited by a request. */
export function touch(licenseId: string, lastUsedAt: Date | null): void {
  if (lastUsedAt && Date.now() - lastUsedAt.getTime() < 24 * 60 * 60 * 1000) return;

  void db.license
    .update({ where: { id: licenseId }, data: { lastUsedAt: new Date() } })
    .catch(() => {});
}

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: unknown }).code === 'P2002'
  );
}

export type { Prisma };
