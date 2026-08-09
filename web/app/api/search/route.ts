import { fail, fromError, json, MAX_QUERY_LENGTH, parseLanguage, parsePage, parseQuery, preflight } from '@/lib/api';
import { searchExpanded } from '@/lib/subtitlecat';

// cheerio needs Node built-ins, and the TTL cache wants a reused instance.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * `GET /api/search?q=shawshank&lang=en&page=1`
 *
 * One page of releases, each already expanded into its subtitle in `lang` — so the usual
 * case needs no second request.
 */
export async function GET(request: Request): Promise<Response> {
  const params = new URL(request.url).searchParams;

  const query = parseQuery(params.get('q'));
  if (!query) {
    return fail(`Give me a title between 2 and ${MAX_QUERY_LENGTH} characters`, 400);
  }

  const language = parseLanguage(params.get('lang'));
  if (!language) return fail('Pick a supported language', 400);

  try {
    return json(await searchExpanded(query, language, parsePage(params.get('page'))));
  } catch (err) {
    return fromError(err);
  }
}

export function OPTIONS(): Response {
  return preflight();
}
