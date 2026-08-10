import { fail, json } from '@/lib/api';
import { safeColor, safeMessage, safeUrl } from '@/lib/announcement';
import { db } from '@/lib/db';
import { requireAdmin } from '@/lib/requireAdmin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * `POST /api/admin/settings` — edit the donation prompt.
 *
 * Everything here is validated on the way in as well as on the way out. This text and
 * colour are rendered by the extension inside pages we do not control, so the validation
 * is not politeness — it is the boundary.
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

  const message = safeMessage(typeof input.message === 'string' ? input.message : '');
  if (input.enabled === true && message.length < 10) {
    return fail('Write a message before switching it on', 400);
  }

  const rawColor = typeof input.color === 'string' ? input.color : '';
  if (rawColor && safeColor(rawColor, '') === '') {
    return fail('Colour must look like #38bdf8', 400);
  }

  const rawUrl = typeof input.url === 'string' ? input.url.trim() : '';
  if (rawUrl && safeUrl(rawUrl) === null) {
    return fail('That link must be a http or https URL', 400);
  }

  const saved = await db.siteSetting.upsert({
    where: { id: 'singleton' },
    update: {
      donationEnabled: input.enabled === true,
      donationMessage: message,
      donationColor: safeColor(rawColor),
      donationUrl: safeUrl(rawUrl),
    },
    create: {
      id: 'singleton',
      donationEnabled: input.enabled === true,
      donationMessage: message,
      donationColor: safeColor(rawColor),
      donationUrl: safeUrl(rawUrl),
    },
  });

  return json({
    ok: true,
    enabled: saved.donationEnabled,
    message: saved.donationMessage,
    color: saved.donationColor,
    url: saved.donationUrl,
  });
}
