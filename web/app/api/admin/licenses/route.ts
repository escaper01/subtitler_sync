import { randomUUID } from 'node:crypto';
import { fail, json } from '@/lib/api';
import { grant } from '@/lib/entitlement';
import { issueLicense } from '@/lib/license';
import { requireAdmin } from '@/lib/requireAdmin';
import { getSettings } from '@/lib/settings';
import { findOrCreateUser } from '@/lib/users';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_DAYS = 3650;

/**
 * `POST /api/admin/licenses` — issue a key by hand.
 *
 * For replacing a key somebody lost, or giving access to someone who paid another way. The
 * key is returned once and never again; only its hash is stored.
 *
 * Checks for itself, like every `/api/admin/*` route: middleware covers `/admin/*` pages
 * and never runs for `/api/*`.
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

  const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
  if (!email.includes('@')) return fail('Give an email address', 400);

  const days = Number(input.days);
  if (!Number.isInteger(days) || days < 1 || days > MAX_DAYS) {
    return fail(`Days must be a whole number between 1 and ${MAX_DAYS}`, 400);
  }

  const note = typeof input.note === 'string' ? input.note.trim().slice(0, 200) : '';

  const user = await findOrCreateUser({ email });
  const settings = await getSettings();

  // A fresh dedupe key each time, deliberately: an admin issuing the same thing twice
  // means it twice. Idempotency is for webhooks, which resend on their own.
  await grant({
    userId: user.id,
    source: 'ADMIN',
    days,
    dedupeKey: `admin:${randomUUID()}`,
    note: note ? `${note} — by ${gate.email}` : `Issued by ${gate.email}`,
  });

  // Our own keys are UUIDs, the same shape Lemon Squeezy issues, so the extension and the
  // validator cannot tell the two apart and do not need to.
  const key = randomUUID();
  await issueLicense({
    key,
    userId: user.id,
    source: 'ADMIN',
    activationLimit: settings.defaultDeviceLimit,
    note: note || `Issued by ${gate.email}`,
  });

  return json({ key, email, days }, { status: 201 });
}
