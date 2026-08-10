import type { AuthOptions } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import { isAdminEmail } from '@/lib/admins';

/**
 * Authentication — for the dashboard, and nothing else.
 *
 * Customers never sign in. They buy a licence key, paste it into the extension, and the
 * key is their credential; see `lib/license.ts`. So this instance exists solely for
 * `/admin`, and `signIn` refuses any address that is not in the `Admin` table — meaning a
 * stranger cannot hold a session at all.
 *
 * That property is worth protecting. `requireAdmin()` still re-checks on every
 * `/api/admin/*` route rather than relying on it, because defence that depends on one
 * callback staying strict is not defence.
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
      // it does not own.
      const verified = (profile as { email_verified?: boolean } | undefined)?.email_verified;
      if (!email || verified === false) return false;

      return isAdminEmail(email);
    },

    async jwt({ token }) {
      // Re-derived on every refresh, so deleting an `Admin` row ends dashboard access at
      // the next request rather than whenever the token would have expired.
      token.isAdmin = await isAdminEmail(token.email);

      // Entitlement is deliberately NOT in the token: a subscription bought thirty seconds
      // ago must work now, not at the next refresh. It is read from the database per
      // request instead.
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
    // Neutral, because this page is now reached by ordinary users too. `/admin/login`
    // still exists as its own route for the dashboard.
    signIn: '/signin',
    error: '/signin',
  },
};
