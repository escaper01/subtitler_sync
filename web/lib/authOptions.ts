import type { AuthOptions } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import { isAdminEmail } from '@/lib/admins';

/**
 * Authentication, for the dashboard and nothing else.
 *
 * **`signIn` is a security boundary again.** It briefly was not: when customers had
 * accounts, any verified Google address could hold a session and `token.isAdmin` was what
 * told an admin apart. Customers have no accounts now — there is no `User` table to put
 * them in — so an address outside the `Admin` table has nothing it could possibly do here,
 * and is refused outright rather than given a useless session.
 *
 * `requireAdmin()` stays on every `/api/admin/*` route and `token.isAdmin` stays in
 * `middleware.ts` regardless. Those are the checks that actually gate things; this one
 * closes the front door.
 */

/**
 * Fail loudly on missing configuration — but at request time, not at import.
 *
 * Validating at module load meant `next build` needed the production secrets just to
 * collect page data. Called from the auth route, this turns a missing secret into a clear
 * error rather than a sign-in that merely refuses.
 */
export function assertAuthEnv(): void {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('NEXTAUTH_SECRET must be set to a string of at least 32 characters');
  }
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    throw new Error('GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set');
  }
}

export const authOptions: AuthOptions = {
  secret: process.env.NEXTAUTH_SECRET,

  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID ?? '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
    }),
  ],

  session: { strategy: 'jwt' },

  callbacks: {
    async signIn({ profile }) {
      const email = profile?.email;
      // Without `email_verified` a federated account could in principle assert an address
      // it does not own — and the address is the whole of the admin check.
      const verified = (profile as { email_verified?: boolean } | undefined)?.email_verified;
      if (!email || verified === false) return false;

      // Errs closed: `isAdminEmail` denies on a database failure rather than granting.
      return isAdminEmail(email);
    },

    async jwt({ token }) {
      // Re-derived on every refresh, so deleting an `Admin` row ends dashboard access at
      // the next request rather than whenever the token would have expired.
      token.isAdmin = await isAdminEmail(token.email);
      return token;
    },

    async session({ session, token }) {
      if (session.user) {
        session.user.isAdmin = Boolean(token.isAdmin);
      }
      return session;
    },
  },

  pages: {
    // The dashboard's own entry point. It pointed at a neutral `/signin` while customers
    // had accounts; that route went with them, and leaving this behind meant a failed
    // sign-in landed on a 404.
    signIn: '/admin/login',
    error: '/admin/login',
  },
};
