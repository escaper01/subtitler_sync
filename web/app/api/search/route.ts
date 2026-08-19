import { denied, fail, fromError, json, MAX_QUERY_LENGTH, parseLanguage, parsePage, parseQuery, preflight } from '@/lib/api';
import { checkSearchLimits } from '@/lib/rateLimit';
import { searchExpanded } from '@/lib/subtitlecat';
import { logSearch } from '@/lib/searchLog';

// cheerio needs Node built-ins, and the TTL cache wants a reused instance.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * `GET /api/search?q=shawshank&lang=en&page=1`
 *
 * One page of releases, each already expanded into its subtitle in `lang` — so the usual
 * case needs no second request.
 *
 * **Open, and rate-limited rather than authenticated.** The licence gate that used to run
 * here is gone with the paywall. What replaces it is a counter keyed on the extension's
 * install id and the caller's hashed address, which is enough to stop this being used as
 * somebody's free scraping backend and is not meant to be more than that.
 */
export async function GET(request: Request): Promise<Response> {
  const params = new URL(request.url).searchParams;

  const query = parseQuery(params.get('q'));
  if (!query) {
    return fail(`Give me a title between 2 and ${MAX_QUERY_LENGTH} characters`, 400);
  }

  const language = parseLanguage(params.get('lang'));
  if (!language) return fail('Pick a supported language', 400);

  const page = parsePage(params.get('page'));

  // Before any upstream work: a refused search must cost subtitlecat nothing.
  const limit = await checkSearchLimits(request);
  if (!limit.allowed) {
    logSearch({ query, language, page, outcome: 'DENIED', request });
    return denied(
      'rate_limited',
      'That is a lot of searching. Try again shortly.',
      429,
      undefined,
      limit.retryAfter,
    );
  }

  try {
    const result = await searchExpanded(query, language, page);
    logSearch({
      query,
      language,
      page,
      outcome: 'OK',
      results: result.releases.length,
      request,
    });
    return json(result);
  } catch (err) {
    logSearch({ query, language, page, outcome: 'UPSTREAM_ERROR', request });
    return fromError(err);
  }
}

export function OPTIONS(): Response {
  return preflight();
}
