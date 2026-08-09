import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import { db } from '@/lib/db';
import { fail, json } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const STATUSES = new Set(['NEW', 'REVIEWED', 'RESOLVED', 'DISMISSED']);

/**
 * `PATCH /api/admin/submissions/:id` — move one submission along the queue.
 *
 * Checked here as well as in middleware. Middleware covers `/admin/*` pages; this lives
 * under `/api/*` and would otherwise be reachable by anyone who guessed the path. A route
 * that mutates has to answer for itself rather than trust that something upstream ran.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const session = await getServerSession(authOptions);
  if (!session) return fail('Not signed in', 401);

  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail('Send JSON', 400);
  }

  const status = (body as { status?: unknown }).status;
  if (typeof status !== 'string' || !STATUSES.has(status)) {
    return fail('Unknown status', 400);
  }

  try {
    await db.submission.update({
      where: { id },
      data: { status: status as 'NEW' | 'REVIEWED' | 'RESOLVED' | 'DISMISSED' },
    });
  } catch {
    return fail('No such submission', 404);
  }

  return json({ ok: true });
}
