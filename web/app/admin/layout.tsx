import Link from 'next/link';
import { AdminNav, type NavCounts } from '@/app/admin/AdminNav';
import { ThemeToggle } from '@/components/ThemeToggle';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * What needs attention, for the rail's badges.
 *
 * `groupBy` rather than counting fetched rows: the queue pages cap at 200 and filter by
 * status, so anything derived from them would be wrong in both directions. Errs to zero —
 * a database blip should not put a false "3" next to a link.
 */
async function navCounts(): Promise<NavCounts> {
  try {
    const [submissions, codes] = await Promise.all([
      db.submission.groupBy({ by: ['kind'], where: { status: 'NEW' }, _count: true }),
      db.pendingGrant.count({ where: { status: 'PENDING' } }),
    ]);

    return {
      reports: submissions.find((row) => row.kind === 'REPORT')?._count ?? 0,
      features: submissions.find((row) => row.kind === 'FEATURE')?._count ?? 0,
      codes,
    };
  } catch {
    return { reports: 0, features: 0, codes: 0 };
  }
}

/**
 * Admin shell: a fixed left rail on desktop, a strip of links above the content on narrow
 * screens.
 *
 * Access is decided in `middleware.ts`, not here — by the time this renders the request
 * has already been authorised, so there is no guard component and no loading flash.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const counts = await navCounts();

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[15rem_1fr]">
      <aside className="border-b border-line lg:sticky lg:top-0 lg:h-screen lg:border-r lg:border-b-0">
        <div className="flex h-full flex-col gap-6 p-4">
          <div className="flex items-center gap-2">
            <Link href="/" className="flex items-center gap-2.5">
              <Mark />
              <span className="font-display text-sm font-bold tracking-tight">Admin</span>
            </Link>
            <div className="ml-auto lg:hidden">
              <ThemeToggle />
            </div>
          </div>

          <AdminNav counts={counts} />

          <div className="mt-auto hidden items-center gap-2 lg:flex">
            <ThemeToggle />
            <a
              href="/api/auth/signout"
              className="rounded-xl px-3 py-2 text-sm text-muted transition-colors hover:text-text"
            >
              Sign out
            </a>
          </div>

          <a
            href="/api/auth/signout"
            className="text-sm text-muted transition-colors hover:text-text lg:hidden"
          >
            Sign out
          </a>
        </div>
      </aside>

      <div className="min-w-0">{children}</div>
    </div>
  );
}

function Mark() {
  return (
    <svg viewBox="0 0 32 32" className="h-7 w-7" aria-hidden>
      <rect width="32" height="32" rx="7" fill="var(--frame)" />
      <rect x="8.3" y="14.7" width="15.4" height="3.8" rx="1.9" fill="#38bdf8" />
      <rect x="4.5" y="21.1" width="23" height="3.8" rx="1.9" fill="#38bdf8" />
    </svg>
  );
}
