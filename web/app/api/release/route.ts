import { fail, fromError, json, parseLanguages, parsePath, preflight } from '@/lib/api';
import { filterByLanguage, releaseTracks } from '@/lib/subtitlecat';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * `GET /api/release?path=subs/45/Some.Release.html&langs=en,fr`
 *
 * The languages of one release. Called when the user opens a release the search did not
 * expand eagerly.
 */
export async function GET(request: Request): Promise<Response> {
  const params = new URL(request.url).searchParams;

  const path = parsePath(params.get('path'));
  if (!path) return fail('Which release?', 400);

  try {
    const release = await releaseTracks(path);
    return json({
      ...release,
      tracks: filterByLanguage(release.tracks, parseLanguages(params.get('langs'))),
    });
  } catch (err) {
    return fromError(err);
  }
}

export function OPTIONS(): Response {
  return preflight();
}
