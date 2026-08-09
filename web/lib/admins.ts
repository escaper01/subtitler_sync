import { db } from '@/lib/db';

/**
 * Who is allowed into /admin.
 *
 * The list lives in the `Admin` table, so adding someone is a row rather than a redeploy.
 * The cost is that a sign-in now depends on the database being reachable — which is the
 * right trade here, since every page behind the gate needs it anyway.
 */

/**
 * True when this address is an admin.
 *
 * Errs closed: a database failure denies access rather than granting it. The caller logs;
 * this returns a plain boolean so callers cannot accidentally treat a rejected promise as
 * a pass.
 */
export async function isAdminEmail(email: string | null | undefined): Promise<boolean> {
  const address = email?.trim().toLowerCase();
  if (!address) return false;

  try {
    const admin = await db.admin.findUnique({ where: { email: address } });
    return admin !== null;
  } catch (err) {
    console.error('[auth] could not check the admin list', err);
    return false;
  }
}
