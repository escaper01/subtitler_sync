import { json, preflight } from '@/lib/api';
import { announcementFor } from '@/lib/announcement';
import { optionalViewer } from '@/lib/gate';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * `GET /api/announcement` — the donation prompt, or nothing.
 *
 * Public, and never refuses. Whether someone is a subscriber is decided here from their
 * token, so a client cannot ask for a variant it is not entitled to see, and a subscriber
 * is never asked for money they have already given.
 */
export async function GET(request: Request): Promise<Response> {
  const viewer = await optionalViewer(request);
  const entitled =
    viewer?.entitledUntil !== undefined &&
    viewer?.entitledUntil !== null &&
    viewer.entitledUntil.getTime() > Date.now();

  return json(await announcementFor(entitled));
}

export function OPTIONS(): Response {
  return preflight();
}
