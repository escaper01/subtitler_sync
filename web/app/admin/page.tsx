import Link from 'next/link';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * The overview.
 *
 * Was the single submissions queue; that split into /admin/reports and /admin/features, so
 * this is now the "what needs me today" page. Every number is a link to the thing it
 * counts, because a number you cannot act on is decoration.
 */
export default async function AdminPage() {
  const [newReports, newFeatures, licenses, users, entitled, searchesToday] =
    await Promise.all([
      db.submission.count({ where: { kind: 'REPORT', status: 'NEW' } }),
      db.submission.count({ where: { kind: 'FEATURE', status: 'NEW' } }),
      db.license.count({ where: { status: 'ACTIVE' } }),
      db.user.count(),
      db.user.count({ where: { entitledUntil: { gt: new Date() } } }),
      db.searchLog.count({
        where: { createdAt: { gt: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
      }),
    ]).catch(() => [0, 0, 0, 0, 0, 0]);

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <h1 className="font-display text-2xl font-bold tracking-tight">Overview</h1>

      <section className="mt-6">
        <h2 className="font-mono text-[11px] uppercase tracking-widest text-muted">
          Waiting for you
        </h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <Tile
            href="/admin/reports?status=NEW"
            label="New bug reports"
            value={newReports}
            urgent={newReports > 0}
          />
          <Tile
            href="/admin/features?status=NEW"
            label="New feature requests"
            value={newFeatures}
            urgent={newFeatures > 0}
          />
          <Tile href="/admin/licenses" label="Active licences" value={licenses} />
        </div>
      </section>

      <section className="mt-8">
        <h2 className="font-mono text-[11px] uppercase tracking-widest text-muted">
          Where things stand
        </h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <Tile href="/admin/users" label="Accounts" value={users} />
          <Tile href="/admin/users?filter=entitled" label="With access" value={entitled} />
          <Tile href="/admin/users" label="Searches today" value={searchesToday} />
        </div>
      </section>
    </main>
  );
}

function Tile({
  href,
  label,
  value,
  urgent = false,
}: {
  href: string;
  label: string;
  value: number;
  urgent?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`rounded-2xl border p-4 transition-colors ${
        urgent ? 'border-accent/40 bg-accent/[0.07] hover:border-accent' : 'border-line hover:border-accent'
      }`}
    >
      <span
        className={`block font-display text-3xl font-bold tabular-nums ${urgent ? 'text-accent' : ''}`}
      >
        {value}
      </span>
      <span className="mt-1 block text-sm text-muted">{label}</span>
    </Link>
  );
}
