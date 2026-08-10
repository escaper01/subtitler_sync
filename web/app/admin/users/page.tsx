import Link from 'next/link';
import { db } from '@/lib/db';
import { Access } from '@/app/admin/users/Access';

export const dynamic = 'force-dynamic';

/**
 * Accounts.
 *
 * Sorted by last seen rather than by signup, because the useful question is "who is
 * actually using this", not "who arrived first".
 */
export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; q?: string }>;
}) {
  const { filter, q } = await searchParams;
  const search = q?.trim().toLowerCase();

  const users = await db.user
    .findMany({
      where: {
        ...(filter === 'entitled' ? { entitledUntil: { gt: new Date() } } : {}),
        ...(filter === 'banned' ? { status: 'BANNED' } : {}),
        ...(search ? { email: { contains: search } } : {}),
      },
      orderBy: [{ lastSeenAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
      take: 200,
      select: {
        id: true,
        email: true,
        status: true,
        entitledUntil: true,
        entitlementSource: true,
        createdAt: true,
        lastSeenAt: true,
        _count: { select: { searches: true } },
      },
    })
    .catch(() => []);

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <h1 className="font-display text-2xl font-bold tracking-tight">Users</h1>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <FilterLink label="All" href="/admin/users" active={!filter} />
        <FilterLink
          label="With access"
          href="/admin/users?filter=entitled"
          active={filter === 'entitled'}
        />
        <FilterLink label="Banned" href="/admin/users?filter=banned" active={filter === 'banned'} />

        <form className="ml-auto" action="/admin/users">
          <input
            type="search"
            name="q"
            defaultValue={q ?? ''}
            placeholder="Search by email"
            className="rounded-lg border border-line bg-surface-2 px-3 py-1.5 text-sm outline-none focus:border-accent"
          />
        </form>
      </div>

      {users.length === 0 ? (
        <p className="mt-6 text-sm text-muted">No accounts match that.</p>
      ) : (
        <ul className="mt-6 divide-y divide-line rounded-2xl border border-line">
          {users.map((user) => (
            <li key={user.id}>
              <Link
                href={`/admin/users/${user.id}`}
                className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 transition-colors hover:bg-surface-3"
              >
                <span className="text-sm font-medium">{user.email}</span>
                <Access until={user.entitledUntil} source={user.entitlementSource} />
                {user.status === 'BANNED' && (
                  <span className="rounded border border-drift/30 bg-drift/10 px-1.5 py-0.5 text-[11px] text-drift">
                    banned
                  </span>
                )}
                <span className="ml-auto text-xs text-muted">
                  {user._count.searches} searches
                </span>
                <span className="font-mono text-xs text-muted">
                  {user.lastSeenAt ? user.lastSeenAt.toISOString().slice(0, 10) : 'never seen'}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

function FilterLink({ label, href, active }: { label: string; href: string; active: boolean }) {
  return (
    <a
      href={href}
      className={`rounded-lg border px-2.5 py-1 text-xs transition-colors ${
        active
          ? 'border-accent/40 bg-accent/10 text-accent'
          : 'border-line text-muted hover:text-text'
      }`}
    >
      {label}
    </a>
  );
}
