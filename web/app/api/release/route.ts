import { fail, fromError, json, parseLanguage, parsePath, preflight } from '@/lib/api';
import { filterByLanguage, releaseTracks } from '@/lib/subtitlecat';
import { enforcing, requireEntitlement } from '@/lib/gate';

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

  // Gated as well as search: a release path is a shareable string, so leaving this open
  // would leave a working free API for anyone who has one.
  if (enforcing()) {
    const gate = await requireEntitlement(request);
    if (!gate.ok) return gate.response;
  }

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
