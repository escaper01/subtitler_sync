import Link from 'next/link';

/**
 * Admin shell.
 *
 * Access is decided in `middleware.ts`, not here — by the time this renders the request
 * has already been authorised, so there is no guard component and no loading flash.
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <nav className="border-b border-white/10">
        <div className="mx-auto flex max-w-5xl items-center gap-4 px-6 py-3">
          <span className="text-sm font-semibold text-white">Subtitle Synchronizer</span>
          <Link href="/admin" className="text-sm text-neutral-400 hover:text-white">
            Submissions
          </Link>
          <Link href="/admin/api" className="text-sm text-neutral-400 hover:text-white">
            API
          </Link>
          <a href="/api/auth/signout" className="ml-auto text-sm text-neutral-500 hover:text-white">
            Sign out
          </a>
        </div>
      </nav>
      {children}
    </div>
  );
}
