import { db } from '@/lib/db';
import { fail, json, preflight } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * `POST /api/feedback`
 *
 * Bug reports and feature requests, from the site's forms or from the extension.
 *
 * Open to anyone, so every field is bounded and nothing is trusted. There is no captcha:
 * the queue is small enough to moderate by hand, and a captcha suppresses exactly the
 * low-effort reports that turn out to matter. If it is ever abused, rate limit here.
 */

const LIMITS = {
  message: 4000,
  email: 200,
  subject: 200,
  extensionVersion: 32,
  siteDomain: 253,
  installId: 64,
} as const;

const KINDS = new Set(['REPORT', 'FEATURE']);

/** Trim, bound, and treat empty as absent. */
function field(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed.slice(0, max);
}

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail('Send JSON', 400);
  }

  const input = (body ?? {}) as Record<string, unknown>;

  const kind = typeof input.kind === 'string' ? input.kind.toUpperCase() : '';
  if (!KINDS.has(kind)) return fail('kind must be REPORT or FEATURE', 400);

  const message = field(input.message, LIMITS.message);
  if (!message || message.length < 10) {
    return fail('Tell me a little more — at least a sentence', 400);
  }

  const email = field(input.email, LIMITS.email);
  // Deliberately loose. Real addresses that fail strict patterns are common, and the only
  // cost of a bad one is an undeliverable reply.
  if (email && !email.includes('@')) return fail('That email address looks wrong', 400);

  try {
    await db.submission.create({
      data: {
        kind: kind as 'REPORT' | 'FEATURE',
        message,
        email,
        subject: field(input.subject, LIMITS.subject),
        extensionVersion: field(input.extensionVersion, LIMITS.extensionVersion),
        siteDomain: field(input.siteDomain, LIMITS.siteDomain),
        installId: field(input.installId, LIMITS.installId),
      },
    });
  } catch (err) {
    console.error('[feedback] could not save', err);
    return fail('Could not save that. Try again in a moment.', 500);
  }

  return json({ ok: true }, { status: 201 });
}

export function OPTIONS(): Response {
  return preflight();
}
