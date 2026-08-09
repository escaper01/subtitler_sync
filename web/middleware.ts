import { withAuth } from 'next-auth/middleware';
import { NextResponse } from 'next/server';

/**
 * Gate the pages that need a session.
 *
 * Two different requirements share one matcher, because `withAuth` has a single
 * `authorized` callback for every path it covers:
 *
 *   /admin/*     needs a session AND `token.isAdmin`
 *   /account, /connect   need only a session
 *
 * So `authorized` asks for a token, and the admin part is discriminated in the function
 * body below.
 *
 * A client-side guard would not do for `/admin`: it renders null only after hydration, by
 * which point the whole page bundle — and anything a server component fetched into it —
 * has already been sent to whoever asked.
 *
 * **This deliberately does not cover `/api/*`.** Middleware runs on the edge runtime and
 * cannot reach Prisma, and the extension authenticates with a header rather than a cookie,
 * so it would be checking the wrong thing. API routes answer for themselves — see
 * `lib/requireAdmin.ts` and `lib/gate.ts`.
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
    pages: { signIn: '/signin' },
  },
);

export const config = {
  // The bare '/admin' is listed separately because the negative-lookahead pattern does not
  // match a path with no trailing segment.
  matcher: ['/admin', '/admin/((?!login).*)', '/account/:path*', '/connect/:path*'],
};
