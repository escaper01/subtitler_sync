import type { Submission, SubmissionKind } from '@prisma/client';
import { db } from '@/lib/db';
import { StatusControl } from '@/app/admin/StatusControl';

/**
 * The submissions queue, filtered to one kind.
 *
 * Extracted so `/admin/reports` and `/admin/features` are the same list with a different
 * `where` — they were one flat page, and separating them was the point of the split.
 */

const STATUSES = ['NEW', 'REVIEWED', 'RESOLVED', 'DISMISSED'] as const;

const STATUS_STYLE: Record<string, string> = {
  NEW: 'bg-accent/10 text-accent border-accent/30',
  REVIEWED: 'bg-drift/10 text-drift border-drift/30',
  RESOLVED: 'bg-emerald-500/15 text-emerald-500 border-emerald-500/30',
  DISMISSED: 'bg-surface-3 text-muted border-line',
};

export async function SubmissionList({
  kind,
  status,
  basePath,
}: {
  kind: SubmissionKind;
  status?: string;
  basePath: string;
}) {
  const filter = STATUSES.find((value) => value === status);

  let submissions: Submission[];
  let error: string | null = null;

  try {
    submissions = await db.submission.findMany({
      where: { kind, ...(filter ? { status: filter } : {}) },
      orderBy: [{ createdAt: 'desc' }],
      take: 200,
    });
  } catch (err) {
    console.error('[admin] query failed', err);
    error = 'Could not reach the database. Check DATABASE_URL and that migrations have run.';
    submissions = [];
  }

  // Counted with a groupBy rather than from the rows above, which are capped at 200 and
  // already filtered — deriving from them was wrong in both directions.
  const counts = await db.submission
    .groupBy({ by: ['status'], where: { kind }, _count: true })
    .catch(() => []);

  const countFor = (value: string) =>
    counts.find((row) => row.status === value)?._count ?? 0;

  return (
    <>
      <div className="mt-4 flex flex-wrap gap-2">
        <FilterLink label="All" href={basePath} active={!filter} />
        {STATUSES.map((value) => (
          <FilterLink
            key={value}
            label={`${value[0]}${value.slice(1).toLowerCase()}${countFor(value) ? ` (${countFor(value)})` : ''}`}
            href={`${basePath}?status=${value}`}
            active={filter === value}
          />
        ))}
      </div>

      {error && (
        <p className="mt-6 rounded-lg border border-drift/40 bg-drift/10 px-4 py-3 text-sm text-drift">
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
    </>
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
