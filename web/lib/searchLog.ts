import { createHash } from 'node:crypto';
import type { SearchOutcome } from '@prisma/client';
import { db } from '@/lib/db';

/**
 * Recording searches.
 *
 * Two audiences: the dashboard ("what are people looking for, and what are we failing to
 * find") and abuse review ("is one account being used by twenty people"). Refusals are
 * recorded too, so demand turned away is visible rather than invisible.
 *
 * Every write here is fire-and-forget. A logging failure must never fail the search it was
 * describing.
 */

export interface SearchEvent {
  userId: string | null;
  query: string;
  language: string;
  page: number;
  outcome: SearchOutcome;
  results?: number;
  cached?: boolean;
  request: Request;
}

export function log(event: SearchEvent): void {
  void db.searchLog
    .create({
      data: {
        userId: event.userId,
        query: event.query,
        language: event.language,
        page: event.page,
        outcome: event.outcome,
        results: event.results ?? 0,
        cached: event.cached ?? false,
        ipHash: hashIp(event.request),
        installId: event.request.headers.get('x-subtitler-install')?.slice(0, 64) ?? null,
      },
    })
    .catch((err: unknown) => {
      console.error('[searchlog] could not record', err);
    });
}

export { log as logSearch };

/**
 * A salted hash of the caller's address.
 *
 * Enough to notice one account being used from thirty places, without this table becoming
 * a store of IP addresses. Unsalted would be trivially reversible — the whole IPv4 space
 * hashes in seconds.
 */
export function hashIp(request: Request): string | null {
  // The first entry is the client; the rest are proxies that appended themselves.
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  const ip = forwarded || request.headers.get('x-real-ip')?.trim();
  if (!ip) return null;

  const salt = process.env.IP_HASH_SALT ?? '';
  return createHash('sha256').update(`${ip}:${salt}`).digest('hex').slice(0, 32);
}
