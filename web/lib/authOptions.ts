import type { AuthOptions } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import { isAdminEmail } from '@/lib/admins';

/**
 * Admin authentication: Google, restricted to the rows in the `Admin` table.
 *
 * There is no user table and no roles — the dashboard has exactly one kind of user. Anyone
 * not on the list is refused at `signIn`, so no session is ever created for them.
 */

/**
 * Fail loudly on missing configuration — but at request time, not at import.
 *
 * Validating at module load meant `next build` needed the production secrets just to
 * collect page data, which is both wrong and awkward in CI. Called from the auth route,
 * this turns a missing secret into a clear error rather than a sign-in that just refuses.
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
      // `email_verified` matters: without it a federated account could in principle
      // assert an address it does not own.
      const verified = (profile as { email_verified?: boolean } | undefined)?.email_verified;
      if (verified === false) return false;

      return isAdminEmail(profile?.email);
    },

    async jwt({ token }) {
      // Re-checked on every token refresh, so deleting an Admin row ends that person's
      // access at their next request rather than whenever their session would expire.
      token.isAdmin = await isAdminEmail(token.email);
      return token;
    },
  },

  pages: {
    signIn: '/admin/login',
    error: '/admin/login',
  },
};
