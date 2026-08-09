import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';
import { authOptions } from '@/lib/authOptions';
import { db } from '@/lib/db';
import { isEntitled } from '@/lib/entitlement';
import { mintToken } from '@/lib/extensionToken';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * `POST /api/extension/token` — issue a token for the signed-in user.
 *
 * Called by `/connect`, same-origin, authenticated by the ordinary session cookie. **No
 * CORS headers**: this is deliberately not reachable from anywhere else, and `POST` rather
 * than `GET` so it cannot be triggered by following a link.
 *
 * The token is returned once. Only its hash is stored, so it cannot be shown again — the
 * user mints another instead, which is why old ones expire on their own.
 */
export async function POST(request: Request): Promise<Response> {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email?.toLowerCase();

  if (!email) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  }

  const user = await db.user.findUnique({
    where: { email },
    select: { id: true, status: true, entitledUntil: true, entitlementSource: true },
  });

  if (!user) {
    // A valid session with no account behind it should be impossible — signIn creates the
    // row before the session exists. Worth saying plainly rather than crashing.
    return NextResponse.json({ error: 'No account for that session' }, { status: 500 });
  }

  if (user.status !== 'ACTIVE') {
    return NextResponse.json({ error: 'That account is disabled' }, { status: 403 });
  }

  const { token, expiresAt } = await mintToken(user.id, describeClient(request));

  return NextResponse.json({
    token,
    expiresAt: expiresAt.toISOString(),
    user: {
      email,
      entitled: isEntitled(user),
      entitledUntil: user.entitledUntil?.toISOString() ?? null,
      source: user.entitlementSource,
    },
  });
}

/**
 * A short, human label so someone can tell two devices apart on their account page.
 * Never trusted for anything — it is a hint, from a header the client controls.
 */
function describeClient(request: Request): string {
  const agent = request.headers.get('user-agent') ?? '';
  const browser = /Edg\//.test(agent)
    ? 'Edge'
    : /Chrome\//.test(agent)
      ? 'Chrome'
      : /Firefox\//.test(agent)
        ? 'Firefox'
        : 'Browser';
  const platform = /Windows/.test(agent)
    ? 'Windows'
    : /Mac OS X/.test(agent)
      ? 'macOS'
      : /Linux/.test(agent)
        ? 'Linux'
        : '';
  return platform ? `${browser} on ${platform}` : browser;
}
