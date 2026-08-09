import { fail, fromError, json, parseLanguages, parseQuery, preflight } from '@/lib/api';
import { searchExpanded } from '@/lib/subtitlecat';

// cheerio needs Node built-ins, and the TTL cache wants a reused instance.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * `GET /api/search?q=shawshank&langs=en,fr`
 *
 * Returns every release matching the title, plus the tracks of the best few already
 * expanded and filtered — so the usual case needs no second request.
 */
export async function GET(request: Request): Promise<Response> {
  const params = new URL(request.url).searchParams;

  const query = parseQuery(params.get('q'));
  if (!query) return fail('Give me something to search for', 400);

  try {
    return json(await searchExpanded(query, parseLanguages(params.get('langs'))));
  } catch (err) {
    return fromError(err);
  }
}

export function OPTIONS(): Response {
  return preflight();
}
