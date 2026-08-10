import { Resend } from 'resend';

/**
 * Sending email.
 *
 * Only one thing is ever sent: a trial key. It has to be a real email rather than a value
 * shown on screen, because "one trial per address" means nothing if the address is never
 * checked — anyone would type a fresh fake one for another seven days.
 *
 * Every function here reports success or failure rather than throwing, because the caller
 * has to undo the trial claim when a send fails. A claim burned on an email nobody
 * received is the worst outcome available.
 */

export type SendResult = { ok: true } | { ok: false; error: string };

function client(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  return key ? new Resend(key) : null;
}

function from(): string {
  return process.env.EMAIL_FROM ?? 'Subtitle Synchronizer <onboarding@resend.dev>';
}

export async function sendTrialKey(to: string, key: string, days: number): Promise<SendResult> {
  const resend = client();
  if (!resend) {
    // Explicit rather than silent: in development this is the most likely reason a trial
    // "did not arrive", and it should say so instead of looking like a delivery problem.
    return { ok: false, error: 'Email is not configured (RESEND_API_KEY is unset).' };
  }

  const text = [
    `Here is your ${days}-day trial key for Subtitle Synchronizer:`,
    '',
    key,
    '',
    'To use it: click the extension icon, paste the key, and press Save.',
    'Loading your own subtitle files is free and needs no key at all.',
    '',
    'If you did not ask for this, you can ignore it — nothing has been charged and no',
    'account has been created.',
  ].join('\n');

  try {
    const { error } = await resend.emails.send({
      from: from(),
      to,
      subject: `Your ${days}-day trial key`,
      text,
    });

    if (error) return { ok: false, error: error.message ?? 'The email could not be sent.' };
    return { ok: true };
  } catch (err) {
    console.error('[email] send failed', err);
    return { ok: false, error: 'The email could not be sent.' };
  }
}
