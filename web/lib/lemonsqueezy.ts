import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Lemon Squeezy.
 *
 * They own the subscription clock and the licence keys: a purchase generates a key,
 * emails it to the buyer, and keeps it valid exactly as long as the subscription lasts.
 * We mirror that into our own database so the hot path never depends on their API being
 * up, and only call them when we meet a key we have never seen.
 */

const API = 'https://api.lemonsqueezy.com/v1';

/**
 * Verify a webhook delivery.
 *
 * HMAC-**SHA256**, hex, over the **raw** request body, in `X-Signature`. Verifying against
 * a re-serialised object is the classic mistake here and it fails intermittently — only
 * when key order or number formatting happens not to round-trip — which is far worse than
 * failing outright.
 */
export function verifySignature(rawBody: string, signature: string | null): boolean {
  const secret = process.env.LEMONSQUEEZY_WEBHOOK_SECRET;
  if (!secret || !signature) return false;

  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');

  const given = Buffer.from(signature.trim().toLowerCase(), 'utf8');
  const mine = Buffer.from(expected, 'utf8');
  if (given.length !== mine.length) return false;

  return timingSafeEqual(given, mine);
}

/* ------------------------------------------------------------------- payloads */

export interface LemonWebhook {
  meta?: { event_name?: string; custom_data?: Record<string, unknown> };
  data?: {
    id?: string;
    type?: string;
    attributes?: Record<string, unknown>;
  };
}

export interface SubscriptionFacts {
  subscriptionId: string;
  email: string | null;
  /** `active`, `on_trial`, `past_due`, `cancelled`, `expired`, … */
  status: string | null;
  /** When the current paid period runs out — the next charge, or the cancellation date. */
  validUntil: Date | null;
  variantName: string | null;
}

/** Pull the parts we care about out of a subscription payload. */
export function readSubscription(payload: LemonWebhook): SubscriptionFacts | null {
  const id = payload.data?.id;
  if (!id) return null;

  const attributes = payload.data?.attributes ?? {};
  const email = str(attributes.user_email)?.toLowerCase() ?? null;

  // `ends_at` is set once a subscription is cancelled and states when access actually
  // stops; `renews_at` is the next charge while it is still running. Preferring `ends_at`
  // means a cancellation shortens the window to what was paid for, and no further.
  const until = str(attributes.ends_at) ?? str(attributes.renews_at);

  return {
    subscriptionId: id,
    email,
    status: str(attributes.status) ?? null,
    validUntil: until ? new Date(until) : null,
    variantName: str(attributes.variant_name) ?? null,
  };
}

export interface LicenseKeyFacts {
  externalId: string;
  key: string;
  email: string | null;
  /** Present when the key came from a subscription rather than a one-off order. */
  subscriptionId: string | null;
  status: string | null;
}

/** Pull the parts we care about out of a `license_key_*` payload. */
export function readLicenseKey(payload: LemonWebhook): LicenseKeyFacts | null {
  const id = payload.data?.id;
  const attributes = payload.data?.attributes ?? {};
  const key = str(attributes.key);
  if (!id || !key) return null;

  return {
    externalId: id,
    key,
    email: str(attributes.user_email)?.toLowerCase() ?? null,
    subscriptionId: str(attributes.subscription_id) ?? null,
    status: str(attributes.status) ?? null,
  };
}

/* ---------------------------------------------------------------- the fallback */

export interface ValidatedKey {
  valid: boolean;
  email: string | null;
  externalId: string | null;
  subscriptionId: string | null;
  /** Null when the key has no expiry of its own. */
  expiresAt: Date | null;
}

/**
 * Ask Lemon Squeezy about a key we have never seen.
 *
 * This is the recovery path for a webhook that never arrived — the single most valuable
 * thing here, because otherwise a customer who paid finds their key does not work and the
 * only fix is a support email. Called once, then the result is stored and the fast local
 * lookup takes over.
 *
 * Returns `valid: false` on any failure, including our own network trouble: a key we
 * cannot confirm is not one to grant access on.
 */
export async function validateKey(key: string): Promise<ValidatedKey> {
  const nothing: ValidatedKey = {
    valid: false,
    email: null,
    externalId: null,
    subscriptionId: null,
    expiresAt: null,
  };

  try {
    const response = await fetch(`${API}/licenses/validate`, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ license_key: key }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) return nothing;

    const body = (await response.json()) as {
      valid?: boolean;
      license_key?: { id?: number | string; status?: string; expires_at?: string | null };
      meta?: { customer_email?: string; subscription_id?: number | string | null };
    };

    if (!body.valid || body.license_key?.status === 'disabled') return nothing;

    return {
      valid: true,
      email: body.meta?.customer_email?.toLowerCase() ?? null,
      externalId: body.license_key?.id != null ? String(body.license_key.id) : null,
      subscriptionId:
        body.meta?.subscription_id != null ? String(body.meta.subscription_id) : null,
      expiresAt: body.license_key?.expires_at ? new Date(body.license_key.expires_at) : null,
    };
  } catch {
    return nothing;
  }
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}
