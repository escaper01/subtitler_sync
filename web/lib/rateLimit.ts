import { db } from '@/lib/db';
import { callerSubjects } from '@/lib/callerId';
import { getSettings } from '@/lib/settings';

/**
 * Fixed-window counters, in Postgres.
 *
 * Not in the in-memory `TtlCache`: that is per-instance and lost on cold start, which is
 * fine for caching subtitle pages and useless for anything an abuser benefits from
 * resetting. These have to be exact across every instance.
 *
 * **This is now the only thing in front of the search API.** It used to be a second line
 * behind a licence check — one account could not be resold as a shared search proxy. There
 * are no accounts now, so the endpoints are open and this is the whole guard: enough to
 * stop the API being used as somebody else's free scraping backend, and deliberately not
 * more than that, because the service is meant to be free.
 */

export interface Limit {
  /** What is being limited, e.g. `search:install`. */
  bucket: string;
  /** Who — an install id or a hashed IP. */
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
 * The IP buckets are a multiple of the per-install ones.
 *
 * One address is routinely one household, one office or one campus, so limiting it as
 * tightly as a single browser would turn a shared connection into a single user. The
 * multiplier is what makes the address bucket a backstop against install-id rotation
 * rather than the primary limit.
 */
const IP_MULTIPLIER = 5;

/**
 * Check every search limit for one request, and say whether it may proceed.
 *
 * Both subjects are counted on every call — the install id and the hashed IP — because
 * each covers the other's blind spot (see lib/callerId.ts). A caller with no address
 * header is limited on the install id alone rather than being let through.
 *
 * The limits themselves are read from the dashboard rather than hard-coded. A limit you
 * cannot change without a deploy is one you will not change while somebody is abusing the
 * API, which is the only moment it matters.
 */
export async function checkSearchLimits(request: Request): Promise<LimitResult> {
  const settings = await getSettings();
  return check(request, 'search', settings.searchPerHour, settings.searchPerDay);
}

/**
 * The limits for `/api/release` and `/api/download`.
 *
 * A separate family of buckets, not the search ones. Loading a subtitle is one search
 * followed by one download, so counting both against a single limit would halve the number
 * of searches anyone could actually complete. The allowance is a multiple of the search
 * one because browsing a page of five releases and trying three of them is normal use, and
 * these two endpoints do far less upstream work per call than a search does.
 */
export async function checkFetchLimits(request: Request): Promise<LimitResult> {
  const settings = await getSettings();
  return check(request, 'fetch', settings.searchPerHour * FETCH_MULTIPLIER, settings.searchPerDay * FETCH_MULTIPLIER);
}

/** How much more freely the release/download endpoints may be called than search. */
const FETCH_MULTIPLIER = 3;

/**
 * Count one request against every bucket that applies to it.
 *
 * All four are counted even once one has refused, so a caller cannot dodge the address
 * counter by deliberately tripping the install counter first. The refusal reported is the
 * one that clears soonest, because that is the wait the caller actually faces.
 */
async function check(
  request: Request,
  family: string,
  perHour: number,
  perDay: number,
): Promise<LimitResult> {
  const { install, ip } = callerSubjects(request);

  const limits: Limit[] = [
    { bucket: `${family}:install`, subject: install, max: perHour, windowSeconds: 3600 },
    { bucket: `${family}:install:day`, subject: install, max: perDay, windowSeconds: 86_400 },
  ];

  if (ip) {
    limits.push(
      { bucket: `${family}:ip`, subject: ip, max: perHour * IP_MULTIPLIER, windowSeconds: 3600 },
      { bucket: `${family}:ip:day`, subject: ip, max: perDay * IP_MULTIPLIER, windowSeconds: 86_400 },
    );
  }

  let refusal: LimitResult | null = null;
  for (const limit of limits) {
    const result = await checkLimit(limit);
    if (!result.allowed && (refusal === null || result.retryAfter < refusal.retryAfter)) {
      refusal = result;
    }
  }

  return refusal ?? { allowed: true, retryAfter: 0 };
}

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
export async function checkLimit(limit: Limit): Promise<LimitResult> {
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
