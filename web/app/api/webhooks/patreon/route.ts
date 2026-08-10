import { NextResponse } from 'next/server';
import { handleEvent, verifySignature } from '@/lib/patreon';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * `POST /api/webhooks/patreon`
 *
 * Server-to-server, so **no CORS headers**: this uses `NextResponse.json` directly rather
 * than the `json()` helper from lib/api.ts, which would stamp
 * `Access-Control-Allow-Origin: *` onto a signed endpoint.
 *
 * Status codes matter here, because Patreon retries anything that is not a 2xx:
 *
 *   401  bad signature      — never retry that
 *   400  unparseable        — retrying will not help either
 *   200  handled, or a trigger we do not act on
 *   500  our database failed — we *want* the retry
 */
export async function POST(request: Request): Promise<Response> {
  // Read the raw body exactly once, and verify against those bytes. Verifying against a
  // re-serialised object is the classic mistake, and it fails intermittently — whenever
  // key order or number formatting happens not to round-trip — which is far worse than
  // failing outright.
  const raw = await request.text();

  if (!verifySignature(raw, request.headers.get('x-patreon-signature'))) {
    console.warn('[patreon] rejected a delivery with a bad signature');
    return NextResponse.json({ error: 'Bad signature' }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: 'Unparseable body' }, { status: 400 });
  }

  const trigger = request.headers.get('x-patreon-event') ?? '';

  try {
    const outcome = await handleEvent(trigger, payload as never);
    console.info(`[patreon] ${trigger}: ${outcome.detail}`);

    // Even an unhandled trigger answers 200 — it arrived safely, and there is nothing to
    // gain from Patreon sending it again.
    return NextResponse.json({ ok: outcome.handled, detail: outcome.detail });
  } catch (err) {
    // The one case worth a retry: we could not write it down.
    console.error('[patreon] could not apply a delivery', err);
    return NextResponse.json({ error: 'Could not process that' }, { status: 500 });
  }
}
