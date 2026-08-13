import type { AuthOptions } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import { isAdminEmail } from '@/lib/admins';
import { grantSignupTrial, upsertCustomer } from '@/lib/customers';

/**
 * Authentication, for customers and for the dashboard.
 *
 * Both use the same Google provider and are told apart afterwards: any verified address may
 * sign in and gets a `User` row, and `token.isAdmin` is true only for addresses in the
 * separate `Admin` table.
 *
 * **`signIn` is no longer a security boundary.** It used to refuse everyone who was not an
 * admin, which made "holds a session" and "is an admin" the same statement. They are now
 * different statements, so every admin surface must check for itself — `requireAdmin()` on
 * `/api/admin/*`, and `token.isAdmin` in `middleware.ts` for the pages. Both already did;
 * that is why opening this up is a small change rather than an audit.
 *
 * A banned user is still allowed to sign in. Their session is worthless — `requireUser()`
 * refuses it and every API call fails — but letting them reach an account page that says
 * so is better than an unexplained login failure, which reads as a bug and generates
 * support mail.
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
      // it does not own — and the address is what a `User` row is keyed on.
      const verified = (profile as { email_verified?: boolean } | undefined)?.email_verified;
      if (!email || verified === false) return false;

      try {
        const customer = await upsertCustomer({
          email,
          name: profile?.name ?? null,
          image: (profile as { picture?: string } | undefined)?.picture ?? null,
        });

        if (customer.isNew) {
          await grantSignupTrial(customer.id, customer.email);
        }
      } catch (err) {
        // Refuse rather than hand out a session with no account behind it: every customer
        // route resolves the session's email to a `User` row, and would 500 on each call.
        console.error('[auth] could not create the customer record', err);
        return false;
      }

      return true;
    },

    async jwt({ token }) {
      // Re-derived on every refresh, so deleting an `Admin` row ends dashboard access at
      // the next request rather than whenever the token would have expired.
      token.isAdmin = await isAdminEmail(token.email);

      // Neither entitlement nor ban status is in the token. A subscription bought thirty
      // seconds ago must work now, and a ban must bite now — not at the next refresh. Both
      // are read from the database per request instead.
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
    // Neutral, because customers sign in here too now. `/admin/login` still exists as the
    // dashboard's own entry point and is where `middleware.ts` sends a signed-in non-admin
    // who reaches for `/admin`.
    signIn: '/signin',
    error: '/signin',
  },
};
