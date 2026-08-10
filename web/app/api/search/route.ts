import { denied, fail, fromError, json, MAX_QUERY_LENGTH, parseLanguage, parsePage, parseQuery, preflight } from '@/lib/api';
import { checkLimit, searchLimits } from '@/lib/rateLimit';
import { searchExpanded } from '@/lib/subtitlecat';
import { enforcing, optionalViewer, requireEntitlement, type Viewer } from '@/lib/gate';
import { logSearch } from '@/lib/searchLog';

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

  const page = parsePage(params.get('page'));

  // The gate runs before any upstream work — a refused search must cost subtitlecat
  // nothing. While ENFORCE_ENTITLEMENT is off we still resolve the caller, so the log and
  // the dashboard are already truthful before the rollout flips it on.
  let viewer: Viewer | null;
  if (enforcing()) {
    const gate = await requireEntitlement(request);
    if (!gate.ok) {
      logSearch({ userId: null, query, language, page, outcome: 'DENIED', request });
      return gate.response;
    }
    viewer = gate.viewer;

    // Per licence, not per user: a customer with two keys bought two.
    for (const limit of await searchLimits()) {
      const check = await checkLimit({ ...limit, subject: gate.viewer.licenseId });
      if (!check.allowed) {
        logSearch({ userId: viewer.userId, query, language, page, outcome: 'DENIED', request });
        return denied(
          'rate_limited',
          'That is a lot of searching. Try again shortly.',
          429,
          undefined,
          check.retryAfter,
        );
      }
    }
  } else {
    viewer = await optionalViewer(request);
  }

  try {
    const result = await searchExpanded(query, language, page);
    logSearch({
      userId: viewer?.userId ?? null,
      query,
      language,
      page,
      outcome: 'OK',
      results: result.releases.length,
      request,
    });
    return json(result);
  } catch (err) {
    logSearch({
      userId: viewer?.userId ?? null,
      query,
      language,
      page,
      outcome: 'UPSTREAM_ERROR',
      request,
    });
    return fromError(err);
  }
}

export function OPTIONS(): Response {
  return preflight();
}
