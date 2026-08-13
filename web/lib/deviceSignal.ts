import { createHash } from 'node:crypto';
import { db } from '@/lib/db';

/**
 * Device signals, for spotting one person running several accounts.
 *
 * The problem this solves: `TrialClaim` stops a second trial on the same *address*, but
 * nothing stops someone making a new Google account and taking another seven days. A
 * device signal is the cheapest evidence that two accounts are one person.
 *
 * **This is a flag for a human, not an enforcement mechanism.** Shared machines, families,
 * offices, libraries and privacy browsers all produce false matches, so nothing here bans
 * anyone or refuses anything — it surfaces a list in the dashboard for an admin to judge.
 * Wiring it to an automatic action would lock out real customers, silently.
 *
 * Everything identifying is hashed with a salt held only by the server: matching survives,
 * because equal inputs hash equally, but the table cannot be cross-referenced against a
 * fingerprint collected anywhere else.
 */

/** Attributes the browser reports, before hashing. */
export interface RawDeviceSignal {
  /** FingerprintJS visitor id. */
  visitorId: string;
  timezone?: string | null;
  screen?: string | null;
  platform?: string | null;
  languages?: string | null;
}

export function hashVisitorId(visitorId: string): string {
  const salt = process.env.DEVICE_HASH_SALT ?? '';
  return createHash('sha256').update(`${visitorId}:${salt}`).digest('hex');
}

// IP hashing is not repeated here — `hashIp(request)` in lib/searchLog.ts already owns it,
// salt and truncation included. A second implementation would drift from it, and two
// differently-derived hashes of the same address will never compare equal, which is the
// one thing this table needs them to do.

/** Reasonable bounds on values that arrive from a client and go straight into a column. */
function clamp(value: string | null | undefined, max = 64): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed.slice(0, max);
}

/**
 * Record that this account was used from this device.
 *
 * Upserts, so signing in twice from one machine updates `lastSeenAt` rather than adding a
 * row. Failures are swallowed by the caller: this is diagnostic data, and losing a row is
 * not worth failing a sign-in over.
 */
export async function recordDeviceSignal(
  userId: string,
  raw: RawDeviceSignal,
  ipHash: string | null,
): Promise<void> {
  const visitorHash = hashVisitorId(raw.visitorId);

  const attributes = {
    timezone: clamp(raw.timezone),
    screen: clamp(raw.screen, 32),
    platform: clamp(raw.platform),
    languages: clamp(raw.languages, 128),
    ipHash,
  };

  await db.deviceSignal.upsert({
    where: { userId_visitorHash: { userId, visitorHash } },
    create: { userId, visitorHash, ...attributes },
    update: attributes,
  });
}

export interface SharedAccount {
  visitorHash: string;
  userIds: string[];
}

/**
 * Accounts that share a device with this one.
 *
 * Two queries rather than a join, because the answer is small and the second one is an
 * index lookup on `visitorHash` — the index this table exists for.
 */
export async function accountsSharingDeviceWith(userId: string): Promise<
  { id: string; email: string; status: string; createdAt: Date; sharedDevices: number }[]
> {
  const mine = await db.deviceSignal.findMany({
    where: { userId },
    select: { visitorHash: true },
  });
  if (mine.length === 0) return [];

  const hashes = mine.map((row) => row.visitorHash);

  const others = await db.deviceSignal.findMany({
    where: { visitorHash: { in: hashes }, userId: { not: userId } },
    select: { userId: true, visitorHash: true },
  });
  if (others.length === 0) return [];

  const counts = new Map<string, number>();
  for (const row of others) {
    counts.set(row.userId, (counts.get(row.userId) ?? 0) + 1);
  }

  const users = await db.user.findMany({
    where: { id: { in: [...counts.keys()] } },
    select: { id: true, email: true, status: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  });

  return users.map((user) => ({ ...user, sharedDevices: counts.get(user.id) ?? 0 }));
}
