import Link from 'next/link';
import { AdminNav } from '@/app/admin/AdminNav';
import { ThemeToggle } from '@/components/ThemeToggle';

/**
 * Admin shell: a fixed left rail on desktop, a strip of links above the content on narrow
 * screens.
 *
 * Access is decided in `middleware.ts`, not here — by the time this renders the request
 * has already been authorised, so there is no guard component and no loading flash.
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
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

          <AdminNav />

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
