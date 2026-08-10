import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { LIFETIME_ENDS_AT } from '@/lib/entitlement';
import { Access } from '@/app/admin/users/Access';
import { UserActions } from '@/app/admin/users/[id]/UserActions';

export const dynamic = 'force-dynamic';

/**
 * One account: what they have, what they did, and the two levers over it.
 *
 * Searches are shown newest-first and capped. The queries someone runs are a record of
 * what they watched, so this page is the most sensitive one in the dashboard — it is
 * behind the admin gate and should stay there.
 */
export default async function UserPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const user = await db.user
    .findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        name: true,
        status: true,
        entitledUntil: true,
        entitlementSource: true,
        createdAt: true,
        lastSeenAt: true,
        entitlements: {
          orderBy: { createdAt: 'desc' },
          take: 50,
          select: {
            id: true,
            source: true,
            startsAt: true,
            endsAt: true,
            revokedAt: true,
            note: true,
          },
        },
        searches: {
          orderBy: { createdAt: 'desc' },
          take: 100,
          select: {
            id: true,
            query: true,
            language: true,
            outcome: true,
            results: true,
            installId: true,
            createdAt: true,
          },
        },
        licenses: {
          where: { status: 'ACTIVE' },
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            keyHint: true,
            source: true,
            lastUsedAt: true,
            activationLimit: true,
            _count: { select: { activations: true } },
          },
        },
      },
    })
    .catch(() => null);

  if (!user) notFound();

  // A shared account looks like one identity searching from many installs.
  const installs = new Set(user.searches.map((s) => s.installId).filter(Boolean)).size;

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <Link href="/admin/users" className="text-sm text-muted hover:text-text">
        ← Users
      </Link>

      <h1 className="mt-3 font-display text-2xl font-bold tracking-tight">{user.email}</h1>
      <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted">
        <Access until={user.entitledUntil} source={user.entitlementSource} />
        <span>joined {user.createdAt.toISOString().slice(0, 10)}</span>
        {user.lastSeenAt && <span>last seen {user.lastSeenAt.toISOString().slice(0, 10)}</span>}
        <span>
          {user.licenses.length} licence{user.licenses.length === 1 ? '' : 's'}
        </span>
        {installs > 3 && (
          <span className="rounded border border-drift/30 bg-drift/10 px-1.5 py-0.5 text-drift">
            {installs} installs — possibly shared
          </span>
        )}
      </div>

      <section className="mt-8">
        <h2 className="font-display text-lg font-bold tracking-tight">Give or take access</h2>
        <div className="mt-3">
          <UserActions userId={user.id} banned={user.status === 'BANNED'} />
        </div>
      </section>

      <section className="mt-10">
        <h2 className="font-display text-lg font-bold tracking-tight">Subscription history</h2>
        {user.entitlements.length === 0 ? (
          <p className="mt-2 text-sm text-muted">Never had one.</p>
        ) : (
          <ul className="mt-3 divide-y divide-line rounded-2xl border border-line">
            {user.entitlements.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
                <span className="text-sm font-medium">{row.source.toLowerCase()}</span>
                <span className="font-mono text-xs text-muted">
                  {row.startsAt.toISOString().slice(0, 10)} →{' '}
                  {row.endsAt.getTime() === LIFETIME_ENDS_AT.getTime()
                    ? 'never'
                    : row.endsAt.toISOString().slice(0, 10)}
                </span>
                {row.revokedAt && (
                  <span className="rounded border border-drift/30 bg-drift/10 px-1.5 py-0.5 text-[11px] text-drift">
                    revoked
                  </span>
                )}
                {row.note && <span className="text-xs text-muted">{row.note}</span>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-10">
        <h2 className="font-display text-lg font-bold tracking-tight">
          Searches
          <span className="ml-2 text-sm font-normal text-muted">last {user.searches.length}</span>
        </h2>
        {user.searches.length === 0 ? (
          <p className="mt-2 text-sm text-muted">None.</p>
        ) : (
          <ul className="mt-3 divide-y divide-line rounded-2xl border border-line">
            {user.searches.map((row) => (
              <li key={row.id.toString()} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2">
                <span className="text-sm">{row.query}</span>
                <span className="font-mono text-xs text-muted">{row.language}</span>
                {row.outcome !== 'OK' && (
                  <span className="text-xs text-drift">{row.outcome.toLowerCase()}</span>
                )}
                <span className="ml-auto font-mono text-xs text-muted">
                  {row.createdAt.toISOString().slice(0, 16).replace('T', ' ')}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
