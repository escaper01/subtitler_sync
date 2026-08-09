import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { db } from '@/lib/db';

/**
 * The credential the extension sends on every paid request.
 *
 * **Opaque and random, not a JWT.** A JWT stays valid until it expires unless you keep a
 * denylist — at which point you have the database lookup you were trying to avoid. The
 * request has to read the database for entitlement anyway, so one indexed query returns
 * identity and access together, and revoking is instantaneous.
 *
 * **Hashed with SHA-256, not bcrypt or argon2.** The secret is 256 bits straight out of a
 * CSPRNG, so there is nothing to brute-force and a deliberately slow KDF would just add
 * its cost to every single API call. This is the reasoning; please do not "harden" it.
 */

/** `stx_<id>_<secret>` — the id prefix means a token can be logged as `stx_c1a2…`. */
const PREFIX = 'stx';

const TOKEN_TTL_DAYS = 90;
/** Re-extend only when the remaining life drops below this, so writes stay rare. */
const REFRESH_AFTER_HOURS = 24;

export function hashToken(secret: string): string {
  return createHash('sha256').update(secret).digest('hex');
}

/**
 * Split `stx_<id>_<secret>`. Returns null for anything that is not our shape.
 *
 * Deliberately not `split('_')`: the secret is base64url, whose alphabet **includes the
 * underscore**, so a naive split lands 43 characters of entropy in the wrong bucket about
 * half the time. That failure is per-token and random, which reads as "sign-in works
 * sometimes" rather than as a bug. The id is a cuid and has no underscores, so anchoring
 * on the first two separators and taking the whole remainder as the secret is exact.
 */
const TOKEN_SHAPE = new RegExp(`^${PREFIX}_([^_]+)_(.+)$`);

export function parseToken(raw: string): { id: string; secret: string } | null {
  const match = TOKEN_SHAPE.exec(raw.trim());
  if (!match) return null;

  const [, id, secret] = match;
  if (!id || !secret) return null;
  return { id, secret };
}

export interface MintedToken {
  /** Shown once and never recoverable — only its hash is stored. */
  token: string;
  expiresAt: Date;
}

/**
 * Issue a token for a user.
 *
 * The row is created first so its id can be embedded in the string, then updated with the
 * hash. One round trip more than strictly needed, in exchange for a token that says which
 * row it belongs to without revealing anything.
 */
export async function mintToken(userId: string, label?: string): Promise<MintedToken> {
  const secret = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);

  const row = await db.extensionToken.create({
    data: {
      userId,
      // Replaced immediately below; a placeholder keeps the column non-null and unique.
      tokenHash: `pending:${randomBytes(16).toString('hex')}`,
      label: label?.slice(0, 120),
      expiresAt,
    },
    select: { id: true },
  });

  const token = `${PREFIX}_${row.id}_${secret}`;
  await db.extensionToken.update({
    where: { id: row.id },
    data: { tokenHash: hashToken(secret) },
  });

  return { token, expiresAt };
}

export type TokenLookup =
  | { ok: true; userId: string; email: string; status: string; entitledUntil: Date | null; entitlementSource: string | null }
  | { ok: false; reason: 'malformed' | 'unknown' | 'expired' };

/**
 * Validate a token and return who it belongs to.
 *
 * One indexed read on `tokenHash`, selecting the owner's access state alongside — this is
 * the whole hot path, and the reason `User.entitledUntil` is denormalised.
 *
 * An unknown token and a malformed one are reported separately here but must be reported
 * *identically* to the caller, or a scanner learns which token ids exist.
 */
export async function lookupToken(raw: string | null): Promise<TokenLookup> {
  if (!raw) return { ok: false, reason: 'malformed' };

  const parsed = parseToken(raw);
  if (!parsed) return { ok: false, reason: 'malformed' };

  const row = await db.extensionToken.findUnique({
    where: { tokenHash: hashToken(parsed.secret) },
    select: {
      id: true,
      expiresAt: true,
      revokedAt: true,
      lastUsedAt: true,
      user: {
        select: {
          id: true,
          email: true,
          status: true,
          entitledUntil: true,
          entitlementSource: true,
        },
      },
    },
  });

  // The id in the string must match the row the hash found. Without this the id would be
  // decoration; with it, a token whose halves disagree is rejected.
  if (!row || !constantTimeEquals(row.id, parsed.id)) {
    return { ok: false, reason: 'unknown' };
  }
  if (row.revokedAt) return { ok: false, reason: 'unknown' };
  if (row.expiresAt.getTime() <= Date.now()) return { ok: false, reason: 'expired' };

  void touch(row.id, row.lastUsedAt);

  return {
    ok: true,
    userId: row.user.id,
    email: row.user.email,
    status: row.user.status,
    entitledUntil: row.user.entitledUntil,
    entitlementSource: row.user.entitlementSource,
  };
}

/**
 * Sliding expiry, at most one write per token per day.
 *
 * Someone who keeps using the extension is never signed out; an install nobody has touched
 * for ninety days goes cold on its own. Deliberately not awaited — a failed bookkeeping
 * write must not fail the request it was attached to.
 */
async function touch(id: string, lastUsedAt: Date | null): Promise<void> {
  const stale =
    !lastUsedAt || Date.now() - lastUsedAt.getTime() > REFRESH_AFTER_HOURS * 60 * 60 * 1000;
  if (!stale) return;

  const now = new Date();
  try {
    await db.extensionToken.update({
      where: { id },
      data: {
        lastUsedAt: now,
        expiresAt: new Date(now.getTime() + TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000),
      },
    });
  } catch {
    /* the token was revoked mid-request, or the database blinked — neither is fatal here */
  }
}

function constantTimeEquals(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
