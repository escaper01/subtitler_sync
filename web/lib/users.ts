import { db } from '@/lib/db';
import { grant, grantTrial } from '@/lib/entitlement';

/**
 * What happens the first time — and every time — someone signs in.
 *
 * Kept out of `authOptions` so the callback stays readable, and so this can be called
 * from a test or a script without going through NextAuth.
 */

export interface SignInProfile {
  email: string;
  name?: string | null;
  image?: string | null;
}

/**
 * Upsert the account, give a new one its trial, and hand over anything already paid for.
 *
 * Runs in the `signIn` callback rather than in `jwt`, so a database failure refuses the
 * sign-in instead of producing a session with no user behind it. The cost is that a
 * database outage locks *everyone* out rather than only non-admins — the right direction
 * to fail, but it means the sign-in page must say "try again in a moment" rather than
 * anything about permission.
 */
export async function onSignIn(profile: SignInProfile): Promise<{ id: string }> {
  const email = profile.email.trim().toLowerCase();

  const user = await db.user.upsert({
    where: { email },
    update: {
      // Only ever fill in a blank; someone who set nothing on Google should not have
      // their record cleared on every sign-in.
      name: profile.name ?? undefined,
      image: profile.image ?? undefined,
      lastSeenAt: new Date(),
    },
    create: { email, name: profile.name ?? null, image: profile.image ?? null },
    select: { id: true, trialGrantedAt: true },
  });

  if (!user.trialGrantedAt) {
    const result = await grantTrial(user.id, email);
    // Stamp it either way. A refused trial means this address already had one, and
    // recording that stops us asking again on every future sign-in.
    await db.user.update({
      where: { id: user.id },
      data: { trialGrantedAt: new Date() },
    });
    if (result.granted) {
      console.info(`[auth] trial granted to ${email}`);
    }
  }

  await claimPendingGrants(user.id, email);

  return { id: user.id };
}

/**
 * Hand over any payment that arrived before this account existed.
 *
 * Patreon usually cannot tell us the supporter's email (the payload omits it without the
 * `campaigns.members[email]` scope), so most grants wait to be claimed with a code
 * instead. This covers the happy case where we did get an address and it matches.
 */
async function claimPendingGrants(userId: string, email: string): Promise<void> {
  const waiting = await db.pendingGrant.findMany({
    where: { email, status: 'PENDING' },
    select: { id: true, days: true, source: true, externalId: true },
  });

  for (const pending of waiting) {
    const result = await grant({
      userId,
      source: pending.source,
      days: pending.days,
      dedupeKey: `pending:${pending.id}`,
      note: `Claimed at sign-in (${pending.externalId})`,
    });

    await db.pendingGrant.update({
      where: { id: pending.id },
      data: { status: 'CLAIMED', claimedByUserId: userId, claimedAt: new Date() },
    });

    if (result.granted) {
      console.info(`[auth] pending grant ${pending.id} claimed by ${email}`);
    }
  }
}
