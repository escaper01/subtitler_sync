import type { AuthOptions } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';

/**
 * Admin authentication: Google, restricted to an explicit allowlist.
 *
 * There is no user table and no roles — the dashboard has exactly one kind of user, and a
 * comma-separated env var is the honest expression of that. Anyone not on the list is
 * refused at `signIn`, so no session is ever created for them.
 */

/**
 * Fail loudly on missing configuration — but at request time, not at import.
 *
 * Validating at module load meant `next build` needed the production secrets just to
 * collect page data, which is both wrong and awkward in CI. Called from the auth route,
 * this still turns a missing secret into a clear error instead of the misleading "your
 * account is not authorized" that an empty allowlist produces.
 */
export function assertAuthEnv(): void {
  for (const name of ['NEXTAUTH_SECRET'] as const) {
    const value = process.env[name];
    if (!value || value.length < 32) {
      throw new Error(`${name} must be set to a string of at least 32 characters`);
    }
  }
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    throw new Error('GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set');
  }
  adminEmails();
}

function adminEmails(): string[] {
  const raw = process.env.ADMIN_EMAILS ?? '';
  const emails = raw
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter((email) => email.length > 0);

  if (emails.length === 0) {
    throw new Error('ADMIN_EMAILS must list at least one address, comma-separated');
  }
  return emails;
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
    signIn({ profile }) {
      const email = profile?.email?.toLowerCase();
      // `email_verified` matters: without it a Google Workspace account could in principle
      // assert an address it does not own.
      const verified = (profile as { email_verified?: boolean } | undefined)?.email_verified;
      return Boolean(email && verified !== false && adminEmails().includes(email));
    },

    jwt({ token }) {
      // Re-checked on every token refresh, so removing someone from ADMIN_EMAILS ends
      // their access at the next request rather than whenever their session expires.
      const email = token.email?.toLowerCase();
      token.isAdmin = Boolean(email && adminEmails().includes(email));
      return token;
    },
  },

  pages: {
    signIn: '/admin/login',
    error: '/admin/login',
  },
};
