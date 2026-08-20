import { denied, fail, fromError, json, parseLanguages, parsePath, preflight } from '@/lib/api';
import { checkFetchLimits } from '@/lib/rateLimit';
import { filterByLanguages, releaseTracks } from '@/lib/subtitlecat';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * `GET /api/release?path=subs/45/Some.Release.html&lang=en` (or `lang=en,de`)
 *
 * One release's subtitles, in one or two languages. Search expands every release on the page, so
 * this is only reached when a client asks for a release directly.
 *
 * Rate-limited as well as search, for the same reason it used to be gated as well as
 * search: a release path is a shareable string, so leaving this uncounted would leave an
 * unmetered API for anyone who has one.
 */
export async function GET(request: Request): Promise<Response> {
  const params = new URL(request.url).searchParams;

  const path = parsePath(params.get('path'));
  if (!path) return fail('Which release?', 400);

  const languages = parseLanguages(params.get('lang'));
  if (!languages) return fail('Pick one or two supported languages', 400);

  const limit = await checkFetchLimits(request);
  if (!limit.allowed) {
    return denied('rate_limited', 'Slow down a moment.', 429, undefined, limit.retryAfter);
  }

  try {
    const release = await releaseTracks(path);
    return json({ ...release, tracks: filterByLanguages(release.tracks, languages) });
  } catch (err) {
    return fromError(err);
  }
}

export function OPTIONS(): Response {
  return preflight();
}
