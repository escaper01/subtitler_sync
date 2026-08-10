import { denied } from '@/lib/api';
import { LIFETIME_ENDS_AT } from '@/lib/entitlement';
import { lookupToken } from '@/lib/extensionToken';
import { DONATE_URL, SITE_URL } from '@/lib/site';

/**
 * The paid-feature gate.
 *
 * **This is the enforcement.** The extension's UI state is a convenience — anything shipped
 * inside it can be unpacked and edited — so nothing here trusts the client beyond the
 * opaque token it presents, which it cannot forge.
 *
 * Three properties keep it that way:
 *
 * - The verdict is a server-side hash lookup against a value only we issued.
 * - `/api/download` relays subtitle bytes rather than redirecting, so there is no upstream
 *   URL to lift out of a response and fetch directly.
 * - The token travels in a header, not a cookie, so a hostile page can never have the
 *   browser attach it. That is also what keeps `Access-Control-Allow-Origin: *` safe —
 *   **never** add `Access-Control-Allow-Credentials` alongside it.
 */

export interface Viewer {
  userId: string;
  email: string;
  entitledUntil: Date | null;
  source: string | null;
}

export type Gate =
  | { ok: true; viewer: Viewer }
  | { ok: false; response: Response; code: string };

/**
 * Whether the gate is closed.
 *
 * Off by default, and that is deliberate. An extension build that *sends* the token has to
 * reach users before the server starts *requiring* one — Web Store review plus staggered
 * auto-update takes days, and enforcing early breaks search for everyone already installed,
 * with no way to fix it from the server. Turn this on once the rollout has landed.
 */
export function enforcing(): boolean {
  return process.env.ENFORCE_ENTITLEMENT === 'true';
}

function subscribeAction(): { label: string; url: string } | undefined {
  const url = DONATE_URL || `${SITE_URL}/account`;
  return url ? { label: 'Get subtitle search', url } : undefined;
}

function signInAction(): { label: string; url: string } {
  return { label: 'Sign in', url: `${SITE_URL}/connect` };
}

/**
 * Resolve the caller and decide whether they may use a paid endpoint.
 *
 * Returns a ready-made `Response` on refusal so a route reads as two lines and cannot
 * forget to return the denial:
 *
 *     const gate = await requireEntitlement(request);
 *     if (!gate.ok) return gate.response;
 */
export async function requireEntitlement(request: Request): Promise<Gate> {
  const token = request.headers.get('x-subtitler-key');
  const lookup = await lookupToken(token);

  if (!lookup.ok) {
    // A malformed token and an unknown one answer identically on purpose: distinguishing
    // them would let someone probe which token ids exist.
    const expired = lookup.reason === 'expired';
    return refuse(
      expired ? 'token_expired' : 'not_signed_in',
      expired
        ? 'Your sign-in has expired. Sign in again to keep searching.'
        : 'Sign in to search for subtitles.',
      401,
      signInAction(),
    );
  }

  if (lookup.status !== 'ACTIVE') {
    return refuse(
      'account_disabled',
      'This account has been disabled. Get in touch if that seems wrong.',
      403,
    );
  }

  const viewer: Viewer = {
    userId: lookup.userId,
    email: lookup.email,
    entitledUntil: lookup.entitledUntil,
    source: lookup.entitlementSource,
  };

  const entitled =
    lookup.entitledUntil !== null && lookup.entitledUntil.getTime() > Date.now();

  if (!entitled) {
    // The two null-states of `entitledUntil` are the whole reason it is nullable: never
    // subscribed reads differently to lapsed, and deserves different words.
    return lookup.entitledUntil === null
      ? refuse(
          'no_subscription',
          'Subtitle search needs a subscription. Loading your own files stays free.',
          402,
          subscribeAction(),
        )
      : refuse(
          'subscription_expired',
          'Your subscription has run out. Renew it to search again.',
          402,
          subscribeAction(),
        );
  }

  return { ok: true, viewer };
}

/**
 * The same check, but never refusing — for endpoints that work either way and only want to
 * know who is asking, such as the announcement banner.
 */
export async function optionalViewer(request: Request): Promise<Viewer | null> {
  const lookup = await lookupToken(request.headers.get('x-subtitler-key'));
  if (!lookup.ok || lookup.status !== 'ACTIVE') return null;

  return {
    userId: lookup.userId,
    email: lookup.email,
    entitledUntil: lookup.entitledUntil,
    source: lookup.entitlementSource,
  };
}

export function isLifetime(until: Date | null): boolean {
  return until !== null && until.getTime() === LIFETIME_ENDS_AT.getTime();
}

function refuse(
  code: Parameters<typeof denied>[0],
  message: string,
  status: number,
  action?: { label: string; url: string },
): Gate {
  return { ok: false, code, response: denied(code, message, status, action) };
}
