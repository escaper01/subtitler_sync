import NextAuth from 'next-auth';
import { assertAuthEnv, authOptions } from '@/lib/authOptions';

export const runtime = 'nodejs';
// Without this the route is evaluated during `next build`, which would need the production
// secrets just to collect page data.
export const dynamic = 'force-dynamic';

const handler = NextAuth(authOptions);

/**
 * Configuration is checked here, on the first auth request, rather than at import — see
 * `assertAuthEnv`. A misconfigured deployment then fails with the reason instead of
 * silently refusing every sign-in.
 */
function guarded(request: Request, context: unknown) {
  assertAuthEnv();
  return (handler as (req: Request, ctx: unknown) => Response | Promise<Response>)(
    request,
    context,
  );
}

export { guarded as GET, guarded as POST };
