import { withAuth } from 'next-auth/middleware';
import { NextResponse } from 'next/server';

/**
 * Gate every `/admin/*` route server-side.
 *
 * A client-side guard is not enough: it renders null only *after* hydration, so the whole
 * page bundle — and anything a server component fetched into it — has already been sent to
 * an unauthenticated visitor. Middleware refuses before a byte of the route is served.
 *
 * `isAdmin` is re-derived from the allowlist on every token refresh (see authOptions), so
 * a session that predates someone's removal is rejected here rather than honoured.
 */
export default withAuth(
  function middleware(req) {
    if (!req.nextauth.token?.isAdmin) {
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
  // '/admin/((?!login).*)' alone does not match the bare '/admin' root, which has no
  // trailing segment — list it explicitly or the dashboard index is left unprotected.
  matcher: ['/admin', '/admin/((?!login).*)'],
};
