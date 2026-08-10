import type { MeResponse } from '@/lib/api-types';
import { json, preflight } from '@/lib/api';
import { optionalViewer } from '@/lib/gate';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * `GET /api/me` — who the caller is, and whether they may search.
 *
 * Deliberately never refuses: a signed-out caller gets a truthful "no", not a 401. The
 * panel uses it to say "Sign in" or "Subscribe" *before* someone types a title and presses
 * a button that was never going to work.
 *
 * This is a convenience for the UI and is never the enforcement — that is `lib/gate.ts`,
 * on the routes that actually cost something.
 */
export async function GET(request: Request): Promise<Response> {
  const viewer = await optionalViewer(request);

  const body: MeResponse = viewer
    ? {
        signedIn: true,
        email: viewer.email,
        entitled:
          viewer.entitledUntil !== null && viewer.entitledUntil.getTime() > Date.now(),
        entitledUntil: viewer.entitledUntil?.toISOString() ?? null,
        source: viewer.source,
      }
    : { signedIn: false, email: null, entitled: false, entitledUntil: null, source: null };

  return json(body);
}

export function OPTIONS(): Response {
  return preflight();
}
