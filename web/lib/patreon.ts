import { createHmac, timingSafeEqual } from 'node:crypto';
import { db } from '@/lib/db';
import { createCode } from '@/lib/codes';
import { grant } from '@/lib/entitlement';

/**
 * Patreon webhooks.
 *
 * Two facts about their API shape everything here:
 *
 * 1. **The signature is HMAC-MD5** over the raw request body, hex-encoded, in
 *    `X-Patreon-Signature`. MD5 is their choice, not ours. HMAC-MD5 is not broken for
 *    authentication, so this is fine — please do not "fix" it to SHA-256, which would
 *    silently reject every delivery.
 * 2. **The payload usually has no email.** It is only included when the
 *    `campaigns.members[email]` scope was granted, and even then a supporter's Patreon
 *    address is often not the one they sign in with. So the member id is the identifier we
 *    rely on, and every payment produces something claimable rather than assuming a match.
 */

/** How long a pledge buys. Any active pledge grants access, whatever the amount. */
const DAYS_PER_PLEDGE = 31;

export function verifySignature(rawBody: string, signature: string | null): boolean {
  const secret = process.env.PATREON_WEBHOOK_SECRET;
  if (!secret || !signature) return false;

  const expected = createHmac('md5', secret).update(rawBody).digest('hex');

  const given = Buffer.from(signature.trim().toLowerCase(), 'utf8');
  const mine = Buffer.from(expected, 'utf8');
  if (given.length !== mine.length) return false;

  return timingSafeEqual(given, mine);
}

interface PatreonPayload {
  data?: {
    id?: string;
    attributes?: {
      email?: string;
      full_name?: string;
      patron_status?: string;
      last_charge_date?: string;
      last_charge_status?: string;
      currently_entitled_amount_cents?: number;
    };
  };
}

export type WebhookOutcome =
  | { handled: true; action: 'granted' | 'pending' | 'deactivated' | 'ignored'; detail: string }
  | { handled: false; detail: string };

/**
 * Apply one delivery.
 *
 * Idempotent on `patreon:<memberId>:<lastChargeDate>` — a renewal carries a new charge
 * date, a retry carries the same one, so replays cannot grant twice.
 */
export async function handleEvent(
  trigger: string,
  payload: PatreonPayload,
): Promise<WebhookOutcome> {
  const memberId = payload.data?.id;
  if (!memberId) return { handled: false, detail: 'no member id in payload' };

  const attributes = payload.data?.attributes ?? {};
  const email = attributes.email?.trim().toLowerCase() || null;
  const chargeDate = attributes.last_charge_date ?? 'none';

  // Cancellations and lapses. The paid-for period is deliberately left to run out —
  // someone who cancels keeps what they bought. Revocation is for chargebacks, by hand.
  const ending =
    trigger.endsWith(':delete') ||
    (attributes.patron_status && attributes.patron_status !== 'active_patron');

  await db.patreonMember.upsert({
    where: { memberId },
    update: {
      email,
      cents: attributes.currently_entitled_amount_cents ?? null,
      active: !ending,
      lastChargeDate: attributes.last_charge_date ? new Date(attributes.last_charge_date) : null,
      lastEventAt: new Date(),
    },
    create: {
      memberId,
      email,
      cents: attributes.currently_entitled_amount_cents ?? null,
      active: !ending,
      lastChargeDate: attributes.last_charge_date ? new Date(attributes.last_charge_date) : null,
    },
  });

  if (ending) {
    return { handled: true, action: 'deactivated', detail: `${memberId} is no longer active` };
  }

  // A pledge that has not actually been paid buys nothing yet.
  if (attributes.last_charge_status && attributes.last_charge_status !== 'Paid') {
    return {
      handled: true,
      action: 'ignored',
      detail: `${memberId} last charge is ${attributes.last_charge_status}`,
    };
  }

  const dedupeKey = `patreon:${memberId}:${chargeDate}`;

  // The happy path: we know the address and somebody has signed in with it.
  if (email) {
    const user = await db.user.findUnique({ where: { email }, select: { id: true } });
    if (user) {
      const result = await grant({
        userId: user.id,
        source: 'PATREON',
        days: DAYS_PER_PLEDGE,
        dedupeKey,
        note: `Patreon ${memberId}`,
      });

      await db.patreonMember.update({ where: { memberId }, data: { userId: user.id } });

      return {
        handled: true,
        action: 'granted',
        detail: result.granted ? `granted to ${email}` : `already granted (${dedupeKey})`,
      };
    }
  }

  // Otherwise leave something claimable. This is the normal path, not the exception:
  // without the email scope there is nothing to match on at all.
  const existing = await db.pendingGrant.findUnique({ where: { dedupeKey } });
  if (existing) {
    return { handled: true, action: 'pending', detail: `already pending (${dedupeKey})` };
  }

  const code = await createCode({
    days: DAYS_PER_PLEDGE,
    maxRedemptions: 1,
    note: `Patreon ${memberId}${email ? ` (${email})` : ''}`,
  });

  await db.pendingGrant.create({
    data: {
      email,
      externalId: memberId,
      days: DAYS_PER_PLEDGE,
      dedupeKey,
      codeId: code.id,
      payload: payload as never,
    },
  });

  return {
    handled: true,
    action: 'pending',
    detail: email
      ? `no account for ${email} yet — code ${code.code} is waiting`
      : `no email from Patreon — code ${code.code} is waiting for ${memberId}`,
  };
}
