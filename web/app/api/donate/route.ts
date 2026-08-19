import { json, preflight } from '@/lib/api';
import { donatePrompt } from '@/lib/donate';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * `GET /api/donate` — the donation prompt, or nothing.
 *
 * Public, and never refuses. Replaces `/api/announcement`, which took a licence key so it
 * could stay quiet for people who had already paid; there is nobody to exempt now, so this
 * takes no headers at all and answers everyone the same way.
 *
 * Both extension builds poll this — including the search-free one, for which it is the
 * only request it ever makes to this server.
 */
export async function GET(): Promise<Response> {
  return json(await donatePrompt());
}

export function OPTIONS(): Response {
  return preflight();
}
