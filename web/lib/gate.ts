import { denied } from '@/lib/api';
import { LIFETIME_ENDS_AT } from '@/lib/entitlement';
import { activate, lookupLicense } from '@/lib/license';
import { SITE_URL } from '@/lib/site';

/**
 * The paid-feature gate.
 *
 * **This is the enforcement.** The extension's UI state is a convenience — anything shipped
 * inside it can be unpacked and edited — so nothing here trusts the client beyond the
 * licence key it presents, which it cannot forge.
 *
 * Three properties keep it that way:
 *
 * - The verdict is a server-side hash lookup against a key we issued or were told about.
 * - `/api/download` relays subtitle bytes rather than redirecting, so there is no upstream
 *   URL to lift out of a response and fetch directly.
 * - The key travels in a header, not a cookie, so a hostile page can never have the browser
 *   attach it. That is also what keeps `Access-Control-Allow-Origin: *` safe here —
 *   **never** add `Access-Control-Allow-Credentials` alongside it.
 */

export interface Viewer {
  licenseId: string;
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
 * Off by default, and that is deliberate. An extension build that *sends* a key has to
 * reach users before the server starts *requiring* one — Web Store review plus staggered
 * auto-update takes days, and enforcing early breaks search for everyone already installed,
 * with no way to fix it from the server. Turn this on once the rollout has landed.
 */
export function enforcing(): boolean {
  return process.env.ENFORCE_ENTITLEMENT === 'true';
}

function buyAction(): { label: string; url: string } {
  return { label: 'See the plans', url: `${SITE_URL}/pricing` };
}

/** The extension's anonymous per-install id, which is what a "device" means here. */
function installOf(request: Request): string | null {
  return request.headers.get('x-subtitler-install')?.slice(0, 64) || null;
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
  const lookup = await lookupLicense(request.headers.get('x-subtitler-key'));

  if (!lookup.ok) {
    if (lookup.reason === 'missing') {
      return refuse(
        'not_signed_in',
        'Add your licence key in the extension to search for subtitles.',
        401,
        buyAction(),
      );
    }
    // Unknown and revoked answer alike: telling a stranger which keys exist is not
    // information this endpoint owes them.
    return refuse(
      'unknown_key',
      'That licence key is not recognised. Check it, or get one from the site.',
      401,
      buyAction(),
    );
  }

  if (lookup.status !== 'ACTIVE') {
    return refuse(
      'account_disabled',
      'This licence has been disabled. Get in touch if that seems wrong.',
      403,
    );
  }

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
          buyAction(),
        )
      : refuse(
          'subscription_expired',
          'Your subscription has run out. Renew it to search again.',
          402,
          buyAction(),
        );
  }

  // Only count a device once the licence is otherwise good, so an expired key does not
  // silently burn one of its slots.
  const device = await activate(lookup.licenseId, installOf(request), lookup.activationLimit);
  if (!device.ok) {
    return refuse(
      'device_limit',
      `This key is already in use on ${lookup.activationLimit} devices. Remove it from one of them first.`,
      403,
    );
  }

  return {
    ok: true,
    viewer: {
      licenseId: lookup.licenseId,
      userId: lookup.userId,
      email: lookup.email,
      entitledUntil: lookup.entitledUntil,
      source: lookup.entitlementSource,
    },
  };
}

/**
 * The same check, but never refusing — for endpoints that work either way and only want to
 * know who is asking, such as the upgrade prompt and `/api/me`.
 */
export async function optionalViewer(request: Request): Promise<Viewer | null> {
  const lookup = await lookupLicense(request.headers.get('x-subtitler-key'));
  if (!lookup.ok || lookup.status !== 'ACTIVE') return null;

  return {
    licenseId: lookup.licenseId,
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
