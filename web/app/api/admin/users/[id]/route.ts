import { randomUUID } from 'node:crypto';
import { fail, json } from '@/lib/api';
import { db } from '@/lib/db';
import { grant } from '@/lib/entitlement';
import { requireAdmin } from '@/lib/requireAdmin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_DAYS = 3650;

/**
 * `POST /api/admin/users/:id` — grant, revoke or ban.
 *
 * Checks for itself, like every `/api/admin/*` route: middleware covers `/admin/*` pages
 * and never runs for `/api/*`.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail('Send JSON', 400);
  }

  const input = (body ?? {}) as Record<string, unknown>;
  const user = await db.user.findUnique({ where: { id }, select: { id: true, email: true } });
  if (!user) return fail('No such user', 404);

  switch (input.action) {
    case 'grant': {
      const days = Number(input.days);
      if (!Number.isInteger(days) || days < 1 || days > MAX_DAYS) {
        return fail(`Days must be a whole number between 1 and ${MAX_DAYS}`, 400);
      }

      const note = typeof input.note === 'string' ? input.note.trim().slice(0, 200) : '';

      // A fresh dedupeKey every time, deliberately: an admin granting the same thing twice
      // means it twice. Idempotency is for webhooks, which resend on their own.
      const result = await grant({
        userId: id,
        source: 'ADMIN',
        days,
        dedupeKey: `admin:${randomUUID()}`,
        note: note ? `${note} — by ${gate.email}` : `Granted by ${gate.email}`,
      });

      return json({ ok: result.granted, endsAt: result.granted ? result.endsAt : null });
    }

    case 'revoke': {
      // Every live period, not just the furthest — leaving an older one behind would
      // silently restore access the moment the top one lapsed.
      const now = new Date();
      await db.entitlement.updateMany({
        where: { userId: id, revokedAt: null, endsAt: { gt: now } },
        data: { revokedAt: now },
      });
      await db.$transaction(async (tx) => {
        const { recompute } = await import('@/lib/entitlement');
        await recompute(tx, id);
      });

      return json({ ok: true });
    }

    case 'ban': {
      await db.user.update({ where: { id }, data: { status: 'BANNED' } });
      // Sign every device out at once. The gate refuses a banned user anyway, but leaving
      // live tokens behind would mean unbanning silently restores them too.
      await db.extensionToken.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      console.warn(`[admin] ${gate.email} banned ${user.email}`);
      return json({ ok: true });
    }

    case 'unban': {
      await db.user.update({ where: { id }, data: { status: 'ACTIVE' } });
      return json({ ok: true });
    }

    default:
      return fail('Unknown action', 400);
  }
}
