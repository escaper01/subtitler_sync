import { fail, fromError, json, parseLanguage, parsePath, preflight } from '@/lib/api';
import { filterByLanguage, releaseTracks } from '@/lib/subtitlecat';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * `GET /api/release?path=subs/45/Some.Release.html&lang=en`
 *
 * One release's subtitle in one language. Search expands every release on the page, so
 * this is only reached when a client asks for a release directly.
 */
export async function GET(request: Request): Promise<Response> {
  const params = new URL(request.url).searchParams;

  const path = parsePath(params.get('path'));
  if (!path) return fail('Which release?', 400);

  const language = parseLanguage(params.get('lang'));
  if (!language) return fail('Pick a supported language', 400);

  try {
    const release = await releaseTracks(path);
    return json({ ...release, tracks: filterByLanguage(release.tracks, language) });
  } catch (err) {
    return fromError(err);
  }
}

export function OPTIONS(): Response {
  return preflight();
}
