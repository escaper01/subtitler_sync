import type { Submission } from '@prisma/client';
import { db } from '@/lib/db';
import { StatusControl } from '@/app/admin/StatusControl';

export const dynamic = 'force-dynamic';

/**
 * The submissions queue.
 *
 * Newest first, unresolved first. Deliberately one flat list rather than tabs per kind:
 * the volume is low, and the useful question is "what have I not dealt with", not "show
 * me only feature requests".
 */

const STATUSES = ['NEW', 'REVIEWED', 'RESOLVED', 'DISMISSED'] as const;

const STATUS_STYLE: Record<string, string> = {
  NEW: 'bg-accent/10 text-accent border-accent/30',
  REVIEWED: 'bg-amber-500/15 text-amber-300 border-amber-400/30',
  RESOLVED: 'bg-emerald-500/15 text-emerald-300 border-emerald-400/30',
  DISMISSED: 'bg-surface-3 text-muted border-line',
};

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const filter = STATUSES.find((value) => value === status);

  let submissions: Submission[];
  let error: string | null = null;

  try {
    submissions = await db.submission.findMany({
      where: filter ? { status: filter } : undefined,
      orderBy: [{ createdAt: 'desc' }],
      take: 200,
    });
  } catch (err) {
    // Almost always a missing DATABASE_URL or an un-run migration. Say so, rather than
    // showing a stack trace to someone who just wants to read their reports.
    console.error('[admin] query failed', err);
    error = 'Could not reach the database. Check DATABASE_URL and that migrations have run.';
    submissions = [];
  }

  const counts = submissions.reduce<Record<string, number>>((acc, item) => {
    acc[item.status] = (acc[item.status] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <div className="flex items-baseline gap-3">
        <h1 className="font-display text-2xl font-bold tracking-tight">Submissions</h1>
        <span className="text-sm text-muted">
          {submissions.length}
          {filter ? ` ${filter.toLowerCase()}` : ''}
        </span>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <FilterLink label="All" href="/admin" active={!filter} />
        {STATUSES.map((value) => (
          <FilterLink
            key={value}
            label={`${value[0]}${value.slice(1).toLowerCase()}${counts[value] ? ` (${counts[value]})` : ''}`}
            href={`/admin?status=${value}`}
            active={filter === value}
          />
        ))}
      </div>

      {error && (
        <p className="mt-6 rounded-lg border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </p>
      )}

      {!error && submissions.length === 0 && (
        <p className="mt-6 text-sm text-muted">Nothing here.</p>
      )}

      <ul className="mt-6 space-y-3">
        {submissions.map((item) => (
          <li key={item.id} className="rounded-xl border border-line bg-surface-2 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded border border-line bg-surface-3 px-1.5 py-0.5 text-[11px] font-medium text-text/90">
                {item.kind === 'REPORT' ? 'Bug' : 'Feature'}
              </span>
              <span
                className={`rounded border px-1.5 py-0.5 text-[11px] font-medium ${STATUS_STYLE[item.status]}`}
              >
                {item.status.toLowerCase()}
              </span>
              {item.subject && (
                <span className="text-sm font-medium text-text">{item.subject}</span>
              )}
              <span className="ml-auto text-xs text-muted">
                {item.createdAt.toISOString().slice(0, 16).replace('T', ' ')}
              </span>
            </div>

            <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-text/90">
              {item.message}
            </p>

            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
              {item.email && <span>{item.email}</span>}
              {item.siteDomain && <span>site: {item.siteDomain}</span>}
              {item.extensionVersion && <span>v{item.extensionVersion}</span>}
              {item.installId && <span className="font-mono">{item.installId.slice(0, 8)}</span>}
              <div className="ml-auto">
                <StatusControl id={item.id} status={item.status} />
              </div>
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}

function FilterLink({
  label,
  href,
  active,
}: {
  label: string;
  href: string;
  active: boolean;
}) {
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
