import { db } from '@/lib/db';

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

export const LIMITS = {
  /** Generous for a person, tight for a shared login. */
  searchPerHour: { bucket: 'search:user', max: 60, windowSeconds: 3600 },
  searchPerDay: { bucket: 'search:user:day', max: 300, windowSeconds: 86_400 },
  /** 60-bit codes make guessing hopeless already; this makes it pointless. */
  redeemPerHour: { bucket: 'redeem:ip', max: 5, windowSeconds: 3600 },
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
