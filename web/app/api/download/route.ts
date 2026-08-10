import { fail, fromError, parsePath, preflight, withCors } from '@/lib/api';
import { downloadSubtitle } from '@/lib/subtitlecat';
import { enforcing, requireEntitlement } from '@/lib/gate';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * `GET /api/download?path=subs/53/Some.Release-en.srt`
 *
 * Relays the subtitle text.
 *
 * Relaying rather than redirecting is deliberate: the upstream URL never reaches the
 * client, so when this endpoint starts checking a licence key there is no link to copy
 * around it. It also means the extension needs no host permission for subtitlecat, and
 * encoding of the site's space-bearing filenames is handled once, here.
 */
export async function GET(request: Request): Promise<Response> {
  const path = parsePath(new URL(request.url).searchParams.get('path'));
  if (!path) return fail('Which subtitle?', 400);

  // The one that matters most: this is where the bytes actually leave. A client that
  // skipped search entirely must still be refused here.
  if (enforcing()) {
    const gate = await requireEntitlement(request);
    if (!gate.ok) return gate.response;
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
