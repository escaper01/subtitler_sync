import { db } from '@/lib/db';

/**
 * Customer records.
 *
 * A `User` here is not somebody who logs in — nobody does. It is the person a licence
 * belongs to, created from the email that Lemon Squeezy reports at checkout or that the
 * trial form supplied. It exists so one person holding two keys is one customer, and so
 * the dashboard has something to show.
 */

export interface CustomerInput {
  email: string;
  name?: string | null;
}

/**
 * Find the customer with this address, or create them.
 *
 * Lowercased, because the same person typing `Sam@` and `sam@` is the same person and two
 * rows would split their history in half.
 */
export async function findOrCreateUser(input: CustomerInput): Promise<{ id: string; email: string }> {
  const email = input.email.trim().toLowerCase();

  return db.user.upsert({
    where: { email },
    update: {
      // Only ever fill a blank; someone who bought without a name should not have it
      // wiped by a later purchase that also lacks one.
      name: input.name ?? undefined,
      lastSeenAt: new Date(),
    },
    create: { email, name: input.name ?? null },
    select: { id: true, email: true },
  });
}
