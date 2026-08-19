import type { SearchOutcome } from '@prisma/client';
import { db } from '@/lib/db';
import { hashIp, installOf } from '@/lib/callerId';

/**
 * Recording searches.
 *
 * Two audiences: the dashboard ("what are people looking for, and what are we failing to
 * find") and abuse review ("is one install making thousands of these"). Refusals are
 * recorded too, so demand turned away is visible rather than invisible.
 *
 * There is no user to attribute a search to any more, so the install id carries that job.
 * It is forgeable — see lib/callerId.ts — which makes this good enough for reading demand
 * and only suggestive for spotting abuse. The rate limiter, not this table, is what
 * actually stops anybody.
 *
 * Every write here is fire-and-forget. A logging failure must never fail the search it was
 * describing.
 */

export interface SearchEvent {
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
        query: event.query,
        language: event.language,
        page: event.page,
        outcome: event.outcome,
        results: event.results ?? 0,
        cached: event.cached ?? false,
        ipHash: hashIp(event.request),
        installId: installOf(event.request),
      },
    })
    .catch((err: unknown) => {
      console.error('[searchlog] could not record', err);
    });
}

export { log as logSearch };
