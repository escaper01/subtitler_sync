import { randomInt } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { grantWithin } from '@/lib/entitlement';

/**
 * Redeemable codes.
 *
 * Two things people type them into: the extension popup, and nothing else. So the alphabet
 * avoids characters that look alike when read off a screen or a phone, and the format is
 * grouped for the same reason.
 */

/** No O/0, no I/1, no U (it reads as V in some fonts). ~5.17 bits per character. */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTVWXYZ23456789';
const GROUPS = 3;
const GROUP_SIZE = 4;

/** 12 characters from a 31-symbol alphabet — about 60 bits. Not guessable. */
export function generateCode(): string {
  const groups: string[] = [];
  for (let g = 0; g < GROUPS; g++) {
    let group = '';
    for (let i = 0; i < GROUP_SIZE; i++) {
      // randomInt, not Math.random: these are worth money.
      group += ALPHABET[randomInt(ALPHABET.length)];
    }
    groups.push(group);
  }
  return groups.join('-');
}

/**
 * Accept what a human typed.
 *
 * People paste with stray spaces, type lowercase, and leave the dashes out. All of those
 * are the same code, and refusing them is a support email.
 */
export function normalizeCode(raw: string): string {
  const bare = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (bare.length !== GROUPS * GROUP_SIZE) return bare;

  const groups: string[] = [];
  for (let i = 0; i < bare.length; i += GROUP_SIZE) {
    groups.push(bare.slice(i, i + GROUP_SIZE));
  }
  return groups.join('-');
}

export type RedeemResult =
  | { ok: true; endsAt: Date; days: number }
  | { ok: false; reason: 'unknown' | 'used_up' | 'expired' | 'already_redeemed' };

/**
 * Redeem a code for a user.
 *
 * The counter is claimed with a **conditional UPDATE**, not a read followed by a write.
 * That distinction is the whole point: two people redeeming the last use of a shared code
 * at the same moment both pass a `SELECT count`, and both then write. A single statement
 * whose `WHERE` includes `redemptionCount < maxRedemptions` can only succeed once, because
 * Postgres serialises the row.
 *
 * Raw SQL because the comparison is column-to-column, which Prisma's `where` cannot
 * express — and expressing it in application code is exactly the race being avoided.
 *
 * Everything runs in one transaction, so a code cannot be spent by a grant that then fails.
 */
export async function redeemCode(
  rawCode: string,
  userId: string,
  ipHash?: string | null,
): Promise<RedeemResult> {
  const code = normalizeCode(rawCode);
  if (!code) return { ok: false, reason: 'unknown' };

  return db.$transaction(async (tx): Promise<RedeemResult> => {
    const row = await tx.subscriptionCode.findUnique({
      where: { code },
      select: { id: true, days: true, disabledAt: true, expiresAt: true },
    });
    if (!row) return { ok: false, reason: 'unknown' };

    if (row.disabledAt || (row.expiresAt && row.expiresAt.getTime() <= Date.now())) {
      return { ok: false, reason: 'expired' };
    }

    const claimed = await claimOneUse(tx, row.id);
    if (claimed === 0) return { ok: false, reason: 'used_up' };

    try {
      await tx.codeRedemption.create({ data: { codeId: row.id, userId, ipHash } });
    } catch (err) {
      // @@unique([codeId, userId]) — this person has had this code already. Throwing rolls
      // the whole transaction back, so the use they just claimed is handed back too.
      if (isUniqueViolation(err)) {
        throw new AlreadyRedeemed();
      }
      throw err;
    }

    const result = await grantWithin(tx, {
      userId,
      source: 'CODE',
      days: row.days,
      dedupeKey: `code:${row.id}:${userId}`,
      note: `Redeemed ${code}`,
    });

    if (!result.granted) throw new AlreadyRedeemed();

    return { ok: true, endsAt: result.endsAt, days: row.days };
  }).catch((err: unknown) => {
    if (err instanceof AlreadyRedeemed) {
      return { ok: false, reason: 'already_redeemed' } as const;
    }
    throw err;
  });
}

/**
 * Take one use of a code, atomically.
 *
 * Returns the number of rows changed: 1 if a use was claimed, 0 if there were none left.
 */
async function claimOneUse(tx: Prisma.TransactionClient, id: string): Promise<number> {
  return tx.$executeRaw`
    UPDATE "SubscriptionCode"
       SET "redemptionCount" = "redemptionCount" + 1
     WHERE id = ${id}
       AND "disabledAt" IS NULL
       AND ("expiresAt" IS NULL OR "expiresAt" > NOW())
       AND "redemptionCount" < "maxRedemptions"
  `;
}

/** Thrown to roll the transaction back; turned into a result by the caller. */
class AlreadyRedeemed extends Error {}

export interface CreateCodeInput {
  days: number;
  maxRedemptions?: number;
  note?: string;
  expiresAt?: Date | null;
  patreonEmail?: string | null;
}

/** Mint a code. Retries once on the vanishingly unlikely collision. */
export async function createCode(input: CreateCodeInput) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await db.subscriptionCode.create({
        data: {
          code: generateCode(),
          days: input.days,
          maxRedemptions: input.maxRedemptions ?? 1,
          note: input.note,
          expiresAt: input.expiresAt ?? null,
        },
      });
    } catch (err) {
      if (!isUniqueViolation(err) || attempt === 2) throw err;
    }
  }
  throw new Error('Could not generate a unique code');
}

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: unknown }).code === 'P2002'
  );
}
