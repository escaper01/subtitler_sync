import { db } from '@/lib/db';
import { NewCodeForm } from '@/app/admin/codes/NewCodeForm';

export const dynamic = 'force-dynamic';

/**
 * Codes, and the payments waiting to be claimed.
 *
 * The pending list is the one that matters day to day: every row is somebody who paid and
 * has not been given anything yet, usually because Patreon did not tell us their address.
 */
export default async function CodesPage() {
  const [pending, codes] = await Promise.all([
    db.pendingGrant.findMany({
      where: { status: 'PENDING' },
      orderBy: { createdAt: 'asc' },
      take: 100,
      include: { code: { select: { code: true } } },
    }),
    db.subscriptionCode.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { _count: { select: { redemptions: true } } },
    }),
  ]);

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <h1 className="font-display text-2xl font-bold tracking-tight">Codes</h1>

      <section className="mt-8">
        <h2 className="font-display text-lg font-bold tracking-tight">
          Waiting to be claimed
          {pending.length > 0 && <span className="ml-2 text-sm text-muted">{pending.length}</span>}
        </h2>
        <p className="mt-1 text-sm text-muted">
          Someone paid and has no access yet. Send them the code — that is the whole fix.
        </p>

        {pending.length === 0 ? (
          <p className="mt-4 text-sm text-muted">Nothing waiting.</p>
        ) : (
          <ul className="mt-4 divide-y divide-line rounded-2xl border border-line">
            {pending.map((grant) => (
              <li key={grant.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
                <code className="font-mono text-sm text-accent">{grant.code?.code ?? '—'}</code>
                <span className="text-sm">{grant.email ?? 'no email from Patreon'}</span>
                <span className="text-xs text-muted">{grant.days} days</span>
                <span className="ml-auto font-mono text-xs text-muted">
                  {grant.externalId} · {grant.createdAt.toISOString().slice(0, 10)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-10">
        <h2 className="font-display text-lg font-bold tracking-tight">Make a code</h2>
        <div className="mt-4 max-w-lg">
          <NewCodeForm />
        </div>
      </section>

      <section className="mt-10">
        <h2 className="font-display text-lg font-bold tracking-tight">All codes</h2>
        {codes.length === 0 ? (
          <p className="mt-4 text-sm text-muted">None yet.</p>
        ) : (
          <ul className="mt-4 divide-y divide-line rounded-2xl border border-line">
            {codes.map((code) => {
              const spent = code.redemptionCount >= code.maxRedemptions;
              const dead = spent || code.disabledAt !== null;
              return (
                <li
                  key={code.id}
                  className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3"
                >
                  <code className={`font-mono text-sm ${dead ? 'text-muted line-through' : ''}`}>
                    {code.code}
                  </code>
                  <span className="text-xs text-muted">{code.days} days</span>
                  <span className="text-xs text-muted">
                    {code.redemptionCount} / {code.maxRedemptions} used
                  </span>
                  {code.note && <span className="text-xs text-muted">{code.note}</span>}
                  <span className="ml-auto font-mono text-xs text-muted">
                    {code.createdAt.toISOString().slice(0, 10)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}
