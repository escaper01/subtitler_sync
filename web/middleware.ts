import { withAuth } from 'next-auth/middleware';
import { NextResponse } from 'next/server';

/**
 * Gate the pages that need a session.
 *
 * There is exactly one requirement now: `/admin/*` needs a session **and**
 * `token.isAdmin`. Nobody else has a session at all — customer accounts are gone, and the
 * extension carries no credential — so the dashboard is the only thing there is to gate.
 *
 * A client-side guard would not do for `/admin`: it renders null only after hydration, by
 * which point the whole page bundle — and anything a server component fetched into it —
 * has already been sent to whoever asked.
 *
 * **This deliberately does not cover `/api/*`.** Middleware runs on the edge runtime and
 * cannot reach Prisma, and the extension's endpoints have no session to check in the first
 * place. Those routes answer for themselves — `lib/requireAdmin.ts` under `/api/admin/*`,
 * and `lib/rateLimit.ts` on the public ones.
 */
export default withAuth(
  function middleware(req) {
    const { pathname } = req.nextUrl;

    if (pathname.startsWith('/admin') && !req.nextauth.token?.isAdmin) {
      // A signed-in non-admin lands here. Sending them to the admin login rather than a
      // 404 is deliberate: the dashboard is not a secret, it is simply not theirs.
      const url = new URL('/admin/login', req.url);
      url.searchParams.set('error', 'AccessDenied');
      return NextResponse.redirect(url);
    }

    return NextResponse.next();
  },
  {
    callbacks: { authorized: ({ token }) => Boolean(token) },
    pages: { signIn: '/admin/login' },
  },
);

export const config = {
  // The bare '/admin' is listed separately because the negative-lookahead pattern does not
  // match a path with no trailing segment.
  matcher: ['/admin', '/admin/((?!login).*)'],
};
