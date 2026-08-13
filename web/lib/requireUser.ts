import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import { db } from '@/lib/db';
import { appFail } from '@/lib/appApi';

/**
 * The customer gate for session-authenticated routes.
 *
 * Counterpart to `requireAdmin()`, and it exists for the same reason: `middleware.ts` never
 * runs for `/api/*`, and could not do this check there anyway, since the edge runtime
 * cannot reach Prisma. Every route answers for itself.
 *
 * **This is not the gate the extension goes through.** The extension sends a licence key in
 * a header and is checked by `lib/gate.ts`; there is no cookie on those requests, and there
 * must not be — the wildcard CORS origin is only safe because no credential rides along
 * automatically. This gate is for the web app, where a session cookie is the credential.
 *
 * Returns a ready-made `Response` on failure so a caller cannot forget to return one:
 *
 *     const gate = await requireUser();
 *     if (!gate.ok) return gate.response;
 */

export interface SessionUser {
  id: string;
  email: string;
  status: string;
  entitledUntil: Date | null;
  isEntitled: boolean;
}

export type UserGate =
  | { ok: true; user: SessionUser }
  | { ok: false; response: Response };

/**
 * The signed-in customer, or null.
 *
 * For **pages**, which need to redirect rather than return a JSON error. Routes should use
 * `requireUser()` so the refusal is a `Response` they cannot forget to return.
 *
 * A suspended account resolves here rather than returning null: the account page has to be
 * able to render and say what happened, and only the caller knows whether that matters.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email?.trim().toLowerCase();
  if (!email) return null;

  const user = await db.user.findUnique({
    where: { email },
    select: { id: true, email: true, status: true, entitledUntil: true },
  });
  if (!user) return null;

  return {
    id: user.id,
    email: user.email,
    status: user.status,
    entitledUntil: user.entitledUntil,
    isEntitled: user.entitledUntil !== null && user.entitledUntil.getTime() > Date.now(),
  };
}

export async function requireUser(): Promise<UserGate> {
  const user = await getSessionUser();

  if (!user) {
    // Covers both "no session" and "session whose account no longer exists". The second is
    // deliberately not distinguished: the cookie is real but there is nothing behind it,
    // and the fix in both cases is to sign in again.
    return { ok: false, response: appFail('Not signed in', 401) };
  }

  if (user.status !== 'ACTIVE') {
    return { ok: false, response: appFail('This account has been suspended', 403) };
  }

  return { ok: true, user };
}

/**
 * As `requireUser`, but also demands current access.
 *
 * Split from `requireUser` because the two failures need different answers: someone signed
 * in without a subscription should see their account and a way to buy one, which means the
 * page still has to render for them.
 */
export async function requireEntitledUser(): Promise<UserGate> {
  const gate = await requireUser();
  if (!gate.ok) return gate;

  if (!gate.user.isEntitled) {
    return {
      ok: false,
      response: appFail(
        gate.user.entitledUntil === null
          ? 'This account has no subscription'
          : 'This subscription has expired',
        402,
      ),
    };
  }

  return gate;
}
