import { createHash } from 'node:crypto';
import type { EntitlementSource, Prisma } from '@prisma/client';
import { db } from '@/lib/db';

/**
 * Granting, revoking and recomputing access.
 *
 * **This module is the only writer of `User.entitledUntil`.** That column is a cache of
 * `max(endsAt)` over the user's un-revoked `Entitlement` rows, and it is what every paid
 * request reads. If anything else writes it, the ledger and the cache drift and someone
 * either loses access they paid for or keeps access they did not.
 *
 * Every mutation here runs inside a transaction that ends with `recompute`, so the two can
 * never disagree even if the process dies midway.
 */

/**
 * Lifetime access, as a date rather than a null.
 *
 * A nullable `endsAt` would mean every comparison, every `max()` and every index scan had
 * to special-case it. A sentinel keeps "is this person entitled" as one uniform
 * `entitledUntil > now`, at the cost of a date nobody will be around to see.
 */
export const LIFETIME_ENDS_AT = new Date('9999-12-31T00:00:00.000Z');

export const PLAN_DAYS = {
  TRIAL: 7,
  MONTH: 30,
  YEAR: 365,
} as const;

export type PlanName = keyof typeof PLAN_DAYS | 'LIFETIME';

/** How long the automatic trial lasts. Overridable so it can be tuned without a deploy. */
export function trialDays(): number {
  const raw = Number.parseInt(process.env.TRIAL_DAYS ?? '', 10);
  return Number.isFinite(raw) && raw > 0 ? raw : PLAN_DAYS.TRIAL;
}

/** True when this user may use subtitle search right now. */
export function isEntitled(user: {
  status: string;
  entitledUntil: Date | null;
}): boolean {
  if (user.status !== 'ACTIVE') return false;
  return user.entitledUntil !== null && user.entitledUntil.getTime() > Date.now();
}

/**
 * Recompute `User.entitledUntil` from the ledger.
 *
 * Must run inside the same transaction as whatever changed the ledger. Takes the row with
 * the furthest `endsAt` so the cached source reflects the grant that is actually keeping
 * the user alive, not the most recent one added.
 */
export async function recompute(tx: Prisma.TransactionClient, userId: string): Promise<void> {
  const furthest = await tx.entitlement.findFirst({
    where: { userId, revokedAt: null },
    orderBy: { endsAt: 'desc' },
    select: { endsAt: true, source: true },
  });

  await tx.user.update({
    where: { id: userId },
    data: {
      entitledUntil: furthest?.endsAt ?? null,
      entitlementSource: furthest?.source ?? null,
    },
  });
}

export interface GrantInput {
  userId: string;
  source: EntitlementSource;
  /** Ignored when `lifetime` is set. */
  days?: number;
  lifetime?: boolean;
  /** Makes the grant idempotent — see the `dedupeKey` notes in schema.prisma. */
  dedupeKey: string;
  note?: string;
}

export type GrantResult =
  | { granted: true; endsAt: Date }
  /** The `dedupeKey` already existed: a replayed webhook, or a double-submitted redeem. */
  | { granted: false; reason: 'duplicate' };

/**
 * Grant a period of access.
 *
 * Periods **stack**: a new one starts where the current one ends, not at `now`, so
 * redeeming a month with three days of trial left gives 33 days rather than 30. Buying
 * early never costs the buyer anything.
 *
 * Idempotent through the `dedupeKey` unique index. Catching the constraint violation is
 * deliberate rather than checking first — a check-then-insert races against a webhook
 * retry arriving in parallel, and this cannot.
 */
export async function grant(input: GrantInput): Promise<GrantResult> {
  return db.$transaction(async (tx) => {
    const user = await tx.user.findUnique({
      where: { id: input.userId },
      select: { entitledUntil: true },
    });
    if (!user) throw new Error(`No such user: ${input.userId}`);

    const now = new Date();
    const startsAt =
      user.entitledUntil && user.entitledUntil.getTime() > now.getTime()
        ? user.entitledUntil
        : now;

    const endsAt = input.lifetime
      ? LIFETIME_ENDS_AT
      : new Date(startsAt.getTime() + (input.days ?? 0) * 24 * 60 * 60 * 1000);

    try {
      await tx.entitlement.create({
        data: {
          userId: input.userId,
          source: input.source,
          startsAt,
          endsAt,
          dedupeKey: input.dedupeKey,
          note: input.note,
        },
      });
    } catch (err) {
      if (isUniqueViolation(err)) return { granted: false, reason: 'duplicate' } as const;
      throw err;
    }

    await recompute(tx, input.userId);
    return { granted: true, endsAt } as const;
  });
}

/**
 * Revoke one granted period.
 *
 * For chargebacks and abuse — **not** for cancellation. Someone who cancels a pledge keeps
 * what they paid for; their access ends because no further grant arrives.
 */
export async function revoke(entitlementId: string): Promise<void> {
  await db.$transaction(async (tx) => {
    const row = await tx.entitlement.update({
      where: { id: entitlementId },
      data: { revokedAt: new Date() },
      select: { userId: true },
    });
    await recompute(tx, row.userId);
  });
}

/**
 * Hash an address for `TrialClaim`.
 *
 * Salted so the table is not a list of everyone's email, and stable so the same address
 * always maps to the same row. Rotating the salt hands everybody a fresh trial.
 */
export function trialKey(email: string): string {
  const salt = process.env.TRIAL_HASH_SALT ?? 'subtitler-trial';
  return createHash('sha256').update(`${email.trim().toLowerCase()}:${salt}`).digest('hex');
}

/**
 * Give a brand-new account its trial. At most one per address, ever.
 *
 * The claim is recorded in `TrialClaim`, which has no relation to `User` on purpose:
 * recording it on the entitlement ledger alone would not survive an account being deleted,
 * and delete-then-sign-up-again would mint a fresh trial every time. Creating the claim
 * *first* and letting the unique constraint reject a repeat is what makes this safe under
 * two simultaneous sign-ins.
 */
export async function grantTrial(userId: string, email: string): Promise<GrantResult> {
  const emailHash = trialKey(email);

  try {
    await db.trialClaim.create({ data: { emailHash } });
  } catch (err) {
    if (isUniqueViolation(err)) return { granted: false, reason: 'duplicate' };
    throw err;
  }

  return grant({
    userId,
    source: 'TRIAL',
    days: trialDays(),
    dedupeKey: `trial:${emailHash}`,
    note: 'Automatic trial on first sign-in',
  });
}

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: unknown }).code === 'P2002'
  );
}
