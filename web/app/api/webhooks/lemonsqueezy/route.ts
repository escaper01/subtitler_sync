import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { grant } from '@/lib/entitlement';
import { issueLicense } from '@/lib/license';
import { readLicenseKey, readSubscription, verifySignature, type LemonWebhook } from '@/lib/lemonsqueezy';
import { getSettings } from '@/lib/settings';
import { findOrCreateUser } from '@/lib/users';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * `POST /api/webhooks/lemonsqueezy`
 *
 * Server-to-server, so **no CORS headers**: this uses `NextResponse.json` directly rather
 * than the `json()` helper from lib/api.ts, which would stamp
 * `Access-Control-Allow-Origin: *` onto a signed endpoint.
 *
 * Status codes matter, because Lemon Squeezy retries anything that is not a 2xx:
 *
 *   401  bad signature       — never retry that
 *   400  unparseable         — retrying will not help either
 *   200  handled, or an event we do not act on
 *   500  our database failed — we *want* the retry
 */
export async function POST(request: Request): Promise<Response> {
  // Read the raw body exactly once and verify against those bytes.
  const raw = await request.text();

  if (!verifySignature(raw, request.headers.get('x-signature'))) {
    console.warn('[lemon] rejected a delivery with a bad signature');
    return NextResponse.json({ error: 'Bad signature' }, { status: 401 });
  }

  let payload: LemonWebhook;
  try {
    payload = JSON.parse(raw) as LemonWebhook;
  } catch {
    return NextResponse.json({ error: 'Unparseable body' }, { status: 400 });
  }

  const event = payload.meta?.event_name ?? '';

  try {
    const detail = await handle(event, payload);
    console.info(`[lemon] ${event}: ${detail}`);
    return NextResponse.json({ ok: true, detail });
  } catch (err) {
    // The one case worth a retry: we could not write it down.
    console.error('[lemon] could not apply a delivery', err);
    return NextResponse.json({ error: 'Could not process that' }, { status: 500 });
  }
}

async function handle(event: string, payload: LemonWebhook): Promise<string> {
  if (event.startsWith('license_key_')) return handleLicenseKey(payload);
  if (event.startsWith('subscription_')) return handleSubscription(event, payload);

  // Orders arrive too, but a subscription order is followed by the events above and a
  // one-off has no validity window of its own. Nothing to do, and nothing gained by
  // asking them to send it again.
  return `ignored (${event})`;
}

/**
 * A key was created for a purchase. This is where a licence enters our database.
 *
 * The key is stored hashed; the buyer keeps the only usable copy, which Lemon Squeezy has
 * already emailed them.
 */
async function handleLicenseKey(payload: LemonWebhook): Promise<string> {
  const facts = readLicenseKey(payload);
  if (!facts) return 'no usable licence key in the payload';
  if (!facts.email) return `no email for licence ${facts.externalId}`;

  const user = await findOrCreateUser({ email: facts.email });
  const settings = await getSettings();

  await issueLicense({
    key: facts.key,
    userId: user.id,
    source: 'LEMON',
    externalId: facts.externalId,
    subscriptionId: facts.subscriptionId,
    activationLimit: settings.defaultDeviceLimit,
  });

  return `licence for ${facts.email} recorded`;
}

/**
 * The subscription clock changed.
 *
 * Lemon Squeezy states when the paid period ends, so that date is copied rather than
 * computed — adding thirty days a month drifts a little further every time.
 *
 * A cancellation is **not** a revocation: `ends_at` simply becomes the end of what was
 * already paid for, and access lapses on its own when that passes.
 */
async function handleSubscription(event: string, payload: LemonWebhook): Promise<string> {
  const facts = readSubscription(payload);
  if (!facts) return 'no subscription id in the payload';
  if (!facts.email) return `no email on subscription ${facts.subscriptionId}`;
  if (!facts.validUntil) return `no end date on subscription ${facts.subscriptionId}`;

  // `unpaid` and `expired` mean there is nothing to grant; the existing window runs out.
  const paying = facts.status === 'active' || facts.status === 'on_trial' || facts.status === 'cancelled';
  if (!paying) {
    return `subscription ${facts.subscriptionId} is ${facts.status}; leaving the current period alone`;
  }

  const user = await findOrCreateUser({ email: facts.email });

  // Idempotent on the period being granted: a retry carries the same end date, a renewal
  // carries a new one. So a redelivered webhook cannot extend anybody twice.
  const result = await grant({
    userId: user.id,
    source: 'LEMON',
    endsAt: facts.validUntil,
    dedupeKey: `lemon:${facts.subscriptionId}:${facts.validUntil.toISOString()}`,
    note: facts.variantName ? `Lemon Squeezy — ${facts.variantName}` : 'Lemon Squeezy',
  });

  // Attach the subscription to whichever licence came from it, so the dashboard can show
  // the two together.
  await db.license
    .updateMany({
      where: { subscriptionId: facts.subscriptionId },
      data: { userId: user.id },
    })
    .catch(() => {});

  return result.granted
    ? `${facts.email} valid until ${facts.validUntil.toISOString().slice(0, 10)} (${event})`
    : `already applied (${event})`;
}
