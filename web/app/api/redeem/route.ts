import { denied, fail, json, preflight } from '@/lib/api';
import { redeemCode } from '@/lib/codes';
import { checkLimit, LIMITS } from '@/lib/rateLimit';
import { optionalViewer } from '@/lib/gate';
import { SITE_URL } from '@/lib/site';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * `POST /api/redeem` — spend a code, from the extension popup.
 *
 * Authenticated by the extension token rather than a session, because the popup has one
 * and no cookie for this origin. It is a paid-adjacent endpoint but not a gated one: the
 * whole point is that the caller does *not* have a subscription yet.
 */
export async function POST(request: Request): Promise<Response> {
  const viewer = await optionalViewer(request);
  if (!viewer) {
    return denied('not_signed_in', 'Sign in before redeeming a code.', 401, {
      label: 'Sign in',
      url: `${SITE_URL}/connect`,
    });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail('Send JSON', 400);
  }

  const raw = (body as { code?: unknown }).code;
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    return fail('Which code?', 400);
  }
  if (raw.length > 64) return fail('That is not a code', 400);

  // Bounds guessing. 60-bit codes make a scan hopeless anyway; this makes it pointless,
  // and keeps a wrong-code typo loop from filling the redemption log.
  const limit = await checkLimit({ ...LIMITS.redeemPerHour, subject: viewer.userId });
  if (!limit.allowed) {
    return denied(
      'rate_limited',
      'Too many attempts. Try again in a little while.',
      429,
      undefined,
      limit.retryAfter,
    );
  }

  const result = await redeemCode(raw, viewer.userId);

  if (!result.ok) {
    // Deliberately specific. "Invalid code" for all four sends people to a support form
    // when the answer is usually "you already used this one".
    const message = {
      unknown: 'That code does not exist. Check it and try again.',
      expired: 'That code has expired.',
      used_up: 'That code has already been used.',
      already_redeemed: 'You have already redeemed that code.',
    }[result.reason];

    return fail(message, 400);
  }

  return json({
    ok: true,
    days: result.days,
    entitledUntil: result.endsAt.toISOString(),
  });
}

export function OPTIONS(): Response {
  return preflight();
}
