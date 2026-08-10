import { randomUUID } from 'node:crypto';
import { fail, json, preflight } from '@/lib/api';
import { db } from '@/lib/db';
import { sendTrialKey } from '@/lib/email';
import { grant, trialKey } from '@/lib/entitlement';
import { issueLicense } from '@/lib/license';
import { checkLimit, LIMITS } from '@/lib/rateLimit';
import { hashIp } from '@/lib/searchLog';
import { getSettings } from '@/lib/settings';
import { findOrCreateUser } from '@/lib/users';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * `POST /api/trial` — one free trial per email address.
 *
 * The key is emailed rather than shown, which is the only thing that makes the limit mean
 * anything: an address nobody has to receive mail at is not a limit at all.
 */
export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail('Send JSON', 400);
  }

  const raw = (body as { email?: unknown }).email;
  const email = typeof raw === 'string' ? raw.trim().toLowerCase() : '';

  // Deliberately loose. Addresses that fail strict patterns are real more often than
  // people expect, and an undeliverable one costs nothing but a wasted send.
  if (!email || email.length > 200 || !email.includes('@') || email.includes(' ')) {
    return fail('That does not look like an email address', 400);
  }

  const ip = hashIp(request);
  if (ip) {
    const limit = await checkLimit({ ...LIMITS.trialPerIpPerDay, subject: ip });
    if (!limit.allowed) {
      return fail('That is a lot of trials from one place. Try again tomorrow.', 429);
    }
  }

  const settings = await getSettings();
  const emailHash = trialKey(email);

  // Claim first. The unique constraint is what makes "once per address" true even when two
  // requests arrive at the same moment.
  try {
    await db.trialClaim.create({ data: { emailHash } });
  } catch {
    return fail(
      'That address has already had a trial. See the plans for a subscription.',
      409,
    );
  }

  const user = await findOrCreateUser({ email });
  const key = randomUUID();

  try {
    await grant({
      userId: user.id,
      source: 'TRIAL',
      days: settings.trialDays,
      dedupeKey: `trial:${emailHash}`,
      note: 'Free trial',
    });

    await issueLicense({
      key,
      userId: user.id,
      source: 'TRIAL',
      activationLimit: settings.defaultDeviceLimit,
      note: 'Free trial',
    });

    const sent = await sendTrialKey(email, key, settings.trialDays);
    if (!sent.ok) throw new Error(sent.error);
  } catch (err) {
    // Undo the claim. Somebody whose email never arrived must be able to ask again —
    // otherwise a transient send failure costs them their only trial, permanently.
    await db.trialClaim.delete({ where: { emailHash } }).catch(() => {});
    await db.license.deleteMany({ where: { userId: user.id, source: 'TRIAL' } }).catch(() => {});
    await db.entitlement
      .deleteMany({ where: { userId: user.id, dedupeKey: `trial:${emailHash}` } })
      .catch(() => {});

    console.error('[trial] rolled back', err);
    return fail('We could not send the email just now. Try again in a moment.', 502);
  }

  return json({ ok: true, days: settings.trialDays, email }, { status: 201 });
}

export function OPTIONS(): Response {
  return preflight();
}
