import Link from 'next/link';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * The overview.
 *
 * Every number is a link to the thing it counts, because a number you cannot act on is
 * decoration.
 *
 * It used to lead with subscribers and active licences. Those are gone, and what replaced
 * them is the only operational question left: is the search API being used normally, or is
 * somebody hammering it. `Refused today` is the one to watch — a non-zero number there
 * means the rate limiter is doing work, which is either abuse or a limit set too tight.
 */
export default async function AdminPage() {
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [newReports, newFeatures, donationLinks, searchesToday, refusedToday, installsToday] =
    await Promise.all([
      db.submission.count({ where: { kind: 'REPORT', status: 'NEW' } }),
      db.submission.count({ where: { kind: 'FEATURE', status: 'NEW' } }),
      db.donationLink.count({ where: { visible: true } }),
      db.searchLog.count({ where: { createdAt: { gt: dayAgo } } }),
      db.searchLog.count({ where: { createdAt: { gt: dayAgo }, outcome: 'DENIED' } }),
      db.searchLog
        .findMany({
          where: { createdAt: { gt: dayAgo }, installId: { not: null } },
          distinct: ['installId'],
          select: { installId: true },
        })
        .then((rows) => rows.length),
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
          <Tile href="/admin/donations" label="Donation links" value={donationLinks} />
        </div>
      </section>

      <section className="mt-8">
        <h2 className="font-mono text-[11px] uppercase tracking-widest text-muted">
          Last 24 hours
        </h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <Tile href="/admin/settings" label="Searches" value={searchesToday} />
          <Tile
            href="/admin/settings"
            label="Refused by the limiter"
            value={refusedToday}
            urgent={refusedToday > 0}
          />
          <Tile href="/admin/settings" label="Installs searching" value={installsToday} />
        </div>
        <p className="mt-3 text-xs leading-relaxed text-muted">
          An install id is sent by the extension and can be changed by anyone who edits it,
          so &ldquo;installs&rdquo; is a floor, not a count of people. It is the same value the
          rate limiter counts against.
        </p>
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
