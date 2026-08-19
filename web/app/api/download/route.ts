import { denied, fail, fromError, parsePath, preflight, withCors } from '@/lib/api';
import { checkFetchLimits } from '@/lib/rateLimit';
import { downloadSubtitle } from '@/lib/subtitlecat';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * `GET /api/download?path=subs/53/Some.Release-en.srt`
 *
 * Relays the subtitle text.
 *
 * Relaying rather than redirecting is still deliberate, even with nothing to protect: the
 * upstream URL never reaches the client, so the extension needs no host permission for
 * subtitlecat, and the encoding of the site's space-bearing filenames is handled once,
 * here.
 *
 * This is where the bytes actually leave, so it carries the same counter as `/api/release`
 * — a client that skipped search entirely is still metered.
 */
export async function GET(request: Request): Promise<Response> {
  const path = parsePath(new URL(request.url).searchParams.get('path'));
  if (!path) return fail('Which subtitle?', 400);

  const limit = await checkFetchLimits(request);
  if (!limit.allowed) {
    return denied('rate_limited', 'Slow down a moment.', 429, undefined, limit.retryAfter);
  }

  try {
    const { text, filename } = await downloadSubtitle(path);

    return withCors(
      new Response(text, {
        headers: {
          // Charset matters: the parser re-decodes bytes, and mislabelling here would
          // mangle every non-Latin track before it ever reached it.
          'Content-Type': 'text/plain; charset=utf-8',
          'X-Subtitle-Filename': encodeURIComponent(filename),
          'Cache-Control': 'public, max-age=3600',
        },
      }),
    );
  } catch (err) {
    return fromError(err);
  }
}

export function OPTIONS(): Response {
  return preflight();
}
