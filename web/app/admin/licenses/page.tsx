import Link from 'next/link';
import { db } from '@/lib/db';
import { LIFETIME_ENDS_AT } from '@/lib/entitlement';
import { NewLicenseForm } from '@/app/admin/licenses/NewLicenseForm';

export const dynamic = 'force-dynamic';

/**
 * Every licence key.
 *
 * Bought keys arrive here through the Lemon Squeezy webhook; trials and hand-outs are made
 * here. The key itself is not shown — only its first characters — because we store a hash
 * and could not show it even if it were a good idea.
 */
export default async function LicensesPage() {
  const licenses = await db.license
    .findMany({
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: {
        id: true,
        keyHint: true,
        source: true,
        status: true,
        createdAt: true,
        lastUsedAt: true,
        activationLimit: true,
        user: { select: { id: true, email: true, entitledUntil: true } },
        _count: { select: { activations: true } },
      },
    })
    .catch(() => []);

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <h1 className="font-display text-2xl font-bold tracking-tight">Licences</h1>
      <p className="mt-1 text-sm text-muted">
        Purchases arrive by themselves. Make one here to replace a lost key, or to give
        somebody access directly.
      </p>

      <section className="mt-8">
        <h2 className="font-display text-lg font-bold tracking-tight">Issue a licence</h2>
        <div className="mt-4 max-w-lg">
          <NewLicenseForm />
        </div>
      </section>

      <section className="mt-10">
        <h2 className="font-display text-lg font-bold tracking-tight">
          All licences
          {licenses.length > 0 && (
            <span className="ml-2 text-sm font-normal text-muted">{licenses.length}</span>
          )}
        </h2>

        {licenses.length === 0 ? (
          <p className="mt-4 text-sm text-muted">None yet.</p>
        ) : (
          <ul className="mt-4 divide-y divide-line rounded-2xl border border-line">
            {licenses.map((license) => {
              const until = license.user.entitledUntil;
              const live = until !== null && until.getTime() > Date.now();
              const lifetime = until?.getTime() === LIFETIME_ENDS_AT.getTime();

              return (
                <li
                  key={license.id}
                  className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3"
                >
                  <code className="font-mono text-sm">{license.keyHint}…</code>

                  <Link
                    href={`/admin/users/${license.user.id}`}
                    className="text-sm text-muted hover:text-accent"
                  >
                    {license.user.email}
                  </Link>

                  <span className="rounded border border-line bg-surface-3 px-1.5 py-0.5 text-[11px] text-muted">
                    {license.source.toLowerCase()}
                  </span>

                  <span
                    className={`rounded border px-1.5 py-0.5 text-[11px] ${
                      license.status !== 'ACTIVE'
                        ? 'border-drift/30 bg-drift/10 text-drift'
                        : live
                          ? 'border-accent/30 bg-accent/10 text-accent'
                          : 'border-line text-muted'
                    }`}
                  >
                    {license.status !== 'ACTIVE'
                      ? 'revoked'
                      : lifetime
                        ? 'lifetime'
                        : live
                          ? `until ${until!.toISOString().slice(0, 10)}`
                          : 'lapsed'}
                  </span>

                  <span className="text-xs text-muted">
                    {license._count.activations} / {license.activationLimit} devices
                  </span>

                  <span className="ml-auto font-mono text-xs text-muted">
                    {license.createdAt.toISOString().slice(0, 10)}
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
