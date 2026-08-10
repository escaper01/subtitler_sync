import { fail, json } from '@/lib/api';
import { createCode } from '@/lib/codes';
import { requireAdmin } from '@/lib/requireAdmin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Longest a code may run for. A typo of 3650 should not mint a decade by accident. */
const MAX_DAYS = 3650;

/**
 * `POST /api/admin/codes` — mint a code.
 *
 * Like every route under `/api/admin/*`, this checks for itself: middleware covers
 * `/admin/*` pages and never runs for `/api/*`.
 */
export async function POST(request: Request): Promise<Response> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail('Send JSON', 400);
  }

  const input = (body ?? {}) as Record<string, unknown>;

  const days = Number(input.days);
  if (!Number.isInteger(days) || days < 1 || days > MAX_DAYS) {
    return fail(`Days must be a whole number between 1 and ${MAX_DAYS}`, 400);
  }

  const maxRedemptions = input.maxRedemptions === undefined ? 1 : Number(input.maxRedemptions);
  if (!Number.isInteger(maxRedemptions) || maxRedemptions < 1 || maxRedemptions > 10_000) {
    return fail('Uses must be a whole number between 1 and 10000', 400);
  }

  const note = typeof input.note === 'string' ? input.note.trim().slice(0, 200) : undefined;

  const code = await createCode({ days, maxRedemptions, note: note || undefined });

  return json({ code: code.code, days: code.days, maxRedemptions: code.maxRedemptions }, { status: 201 });
}
