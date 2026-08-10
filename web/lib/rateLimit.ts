import { db } from '@/lib/db';
import { getSettings } from '@/lib/settings';

/**
 * Fixed-window counters, in Postgres.
 *
 * Not in the in-memory `TtlCache`: that is per-instance and lost on cold start, which is
 * fine for caching subtitle pages and useless for anything an abuser benefits from
 * resetting. These have to be exact across every instance.
 *
 * The limits are not cost control — upstream is cached and cheap. They exist so one
 * account cannot be resold as a shared search proxy, and so a code cannot be brute-forced.
 */

export interface Limit {
  /** What is being limited, e.g. `search:user`. */
  bucket: string;
  /** Who — a user id or a hashed IP. */
  subject: string;
  max: number;
  windowSeconds: number;
}

export interface LimitResult {
  allowed: boolean;
  /** Seconds until the window rolls. Only meaningful when refused. */
  retryAfter: number;
}

/**
 * The search limits, read from the dashboard rather than hard-coded.
 *
 * A limit you cannot change without a deploy is a limit you will not change while somebody
 * is abusing the API, which is the only moment it matters.
 */
export async function searchLimits(): Promise<Array<Omit<Limit, 'subject'>>> {
  const settings = await getSettings();
  return [
    { bucket: 'search:license', max: settings.searchPerHour, windowSeconds: 3600 },
    { bucket: 'search:license:day', max: settings.searchPerDay, windowSeconds: 86_400 },
  ];
}

/**
 * Fixed limits that protect endpoints rather than customers.
 *
 * These stay in code: they exist to make guessing and spamming pointless, and there is no
 * operational reason to relax them.
 */
export const LIMITS = {
  /** Trial requests, so one person cannot mint keys for a hundred throwaway addresses. */
  trialPerIpPerDay: { bucket: 'trial:ip', max: 3, windowSeconds: 86_400 },
} as const;

/**
 * Count one hit and say whether it is allowed.
 *
 * The window start is folded into the key, so a new window is simply a new row and there
 * is no reset to schedule. One upsert per check.
 *
 * Errs **open**: if the database cannot be reached, the request proceeds. Rate limiting is
 * a guard against abuse, not a security boundary — turning a database blip into an outage
 * for everybody is the worse failure.
 */
export async function checkLimit(
  limit: Omit<Limit, 'subject'> & { subject: string },
): Promise<LimitResult> {
  const now = Date.now();
  const windowMs = limit.windowSeconds * 1000;
  const windowStart = Math.floor(now / windowMs) * windowMs;
  const key = `${limit.bucket}:${limit.subject}:${windowStart}`;
  const expiresAt = new Date(windowStart + windowMs);

  try {
    const row = await db.rateLimit.upsert({
      where: { key },
      update: { count: { increment: 1 } },
      create: { key, count: 1, expiresAt },
      select: { count: true },
    });

    return {
      allowed: row.count <= limit.max,
      retryAfter: Math.max(1, Math.ceil((expiresAt.getTime() - now) / 1000)),
    };
  } catch (err) {
    console.error('[ratelimit] could not count, allowing', err);
    return { allowed: true, retryAfter: 0 };
  }
}

/** Housekeeping: drop windows that have rolled. Safe to run any time. */
export async function sweepExpired(): Promise<number> {
  const { count } = await db.rateLimit.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });
  return count;
}
