import { db } from '@/lib/db';
import { grantTrial } from '@/lib/entitlement';

/**
 * The customer record behind a Google sign-in.
 *
 * `User` predates sign-in — it was created from whatever address a purchase or the trial
 * form supplied. Now it is also the account someone signs in to, so the same row has to be
 * reachable from a Google identity without minting a duplicate for a customer who bought
 * before they ever signed in. The email is the join, which is why it is lowercased on
 * write in both paths.
 */

export interface CustomerIdentity {
  email: string;
  name?: string | null;
  image?: string | null;
}

export interface UpsertedCustomer {
  id: string;
  email: string;
  status: string;
  /** True only on the sign-in that created the row — the trial hangs off this. */
  isNew: boolean;
}

/**
 * Find or create the customer for a verified Google address.
 *
 * Name and picture are refreshed on every sign-in, because they are Google's to change.
 * Nothing about entitlement is touched here: access comes from the ledger, and a sign-in
 * must never be able to extend it.
 */
export async function upsertCustomer(identity: CustomerIdentity): Promise<UpsertedCustomer> {
  const email = identity.email.trim().toLowerCase();

  const existing = await db.user.findUnique({
    where: { email },
    select: { id: true, status: true },
  });

  if (existing) {
    await db.user.update({
      where: { id: existing.id },
      data: {
        name: identity.name ?? undefined,
        image: identity.image ?? undefined,
      },
    });
    return { id: existing.id, email, status: existing.status, isNew: false };
  }

  const created = await db.user.create({
    data: {
      email,
      name: identity.name ?? null,
      image: identity.image ?? null,
    },
    select: { id: true, status: true },
  });

  return { id: created.id, email, status: created.status, isNew: true };
}

/**
 * Give a newly created account its trial.
 *
 * Separate from `upsertCustomer` so a failure here cannot fail the sign-in: someone who
 * cannot get a trial should still get into their account, where the problem is visible and
 * fixable, rather than bouncing off the login page with nothing to go on.
 *
 * `grantTrial` owns the "once per address, ever" rule through `TrialClaim`, so calling this
 * for an address that has already had one is safe and simply does nothing. That matters
 * because deleting an account and signing up again reaches this line with `isNew: true`.
 */
export async function grantSignupTrial(userId: string, email: string): Promise<void> {
  try {
    const result = await grantTrial(userId, email);
    if (!result.granted) return;

    await db.user.update({
      where: { id: userId },
      data: { trialGrantedAt: new Date() },
    });
  } catch (err) {
    console.error('[auth] could not grant the signup trial', err);
  }
}
