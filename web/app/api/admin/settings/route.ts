import { fail, json } from '@/lib/api';
import { safeColor, safeHeading, safeMessage } from '@/lib/donate';
import { db } from '@/lib/db';
import { requireAdmin } from '@/lib/requireAdmin';
import { invalidateSettings } from '@/lib/settings';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * `POST /api/admin/settings` — the donation prompt's wording, and the search limits.
 *
 * Everything is validated on the way in as well as on the way out. The prompt's text and
 * colour are rendered by the extension inside pages we do not control, so that validation
 * is not politeness — it is the boundary.
 *
 * The donation links themselves are a separate resource, at /api/admin/donations.
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

  const heading = safeHeading(typeof input.heading === 'string' ? input.heading : '');
  const message = safeMessage(typeof input.message === 'string' ? input.message : '');
  if (input.enabled === true && message.length < 10) {
    return fail('Write a message before switching the prompt on', 400);
  }

  const rawColor = typeof input.color === 'string' ? input.color : '';
  if (rawColor && safeColor(rawColor, '') === '') {
    return fail('Colour must look like #38bdf8', 400);
  }

  // Bounded rather than merely positive: a typo of 100000 searches an hour is not a limit.
  const searchPerHour = whole(input.searchPerHour, 1, 100_000);
  const searchPerDay = whole(input.searchPerDay, 1, 1_000_000);

  if (searchPerHour === null || searchPerDay === null) {
    return fail('Search limits must be whole numbers', 400);
  }
  if (searchPerDay < searchPerHour) {
    return fail('The daily limit cannot be lower than the hourly one', 400);
  }

  const data = {
    donateEnabled: input.enabled === true,
    donateHeading: heading,
    donateMessage: message,
    donateColor: safeColor(rawColor),
    searchPerHour,
    searchPerDay,
  };

  await db.siteSetting.upsert({
    where: { id: 'singleton' },
    update: data,
    create: { id: 'singleton', ...data },
  });

  // The limiter caches these for a minute; clear it so a tightened limit bites immediately.
  invalidateSettings();

  return json({ ok: true });
}

/** A whole number within bounds, or null. Rejects NaN, floats and out-of-range. */
function whole(value: unknown, min: number, max: number): number | null {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) return null;
  return parsed;
}
