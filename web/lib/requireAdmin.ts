import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import { isAdminEmail } from '@/lib/admins';
import { fail } from '@/lib/api';

/**
 * The admin gate for `/api/admin/*` routes.
 *
 * `middleware.ts` covers `/admin/*` **pages** only — it never runs for `/api/*`, and it
 * could not do this check there anyway, since middleware runs on the edge runtime and
 * cannot reach Prisma. So every mutating admin route has to answer for itself.
 *
 * Two things this deliberately does not do:
 *
 * - It does not trust `token.isAdmin` from the session. The claim is re-checked against
 *   the database, so removing an `Admin` row ends access at the next request rather than
 *   whenever that user's token happens to refresh. One extra query on a surface with
 *   almost no traffic.
 * - It does not merely check that *a session exists*. That was the previous behaviour
 *   here, and it was safe only because `signIn` refused everyone who was not an admin.
 *   The moment end users can sign in, "has a session" means "has a Google account", and
 *   this route mutates the submissions queue.
 *
 * Returns a ready-made `Response` on failure so a caller cannot forget to return one:
 *
 *     const gate = await requireAdmin();
 *     if (!gate.ok) return gate.response;
 */
export type AdminGate =
  | { ok: true; email: string }
  | { ok: false; response: Response };

export async function requireAdmin(): Promise<AdminGate> {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;

  if (!email) {
    return { ok: false, response: fail('Not signed in', 401) };
  }

  if (!(await isAdminEmail(email))) {
    // Deliberately not "you are not an admin" — that tells a stranger their sign-in
    // worked, which is not information this endpoint owes them.
    return { ok: false, response: fail('Not allowed', 403) };
  }

  return { ok: true, email };
}
