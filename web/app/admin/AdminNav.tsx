'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * The dashboard's left-hand navigation.
 *
 * A client component only because the active item depends on the current path. The counts
 * are computed on the server and passed in — see `layout.tsx` — so this never queries
 * anything itself.
 */

export interface NavCounts {
  reports: number;
  features: number;
}

const LINKS = [
  { href: '/admin', label: 'Overview', icon: HomeIcon, exact: true, badge: null },
  { href: '/admin/reports', label: 'Bug reports', icon: BugIcon, exact: false, badge: 'reports' },
  { href: '/admin/features', label: 'Requests', icon: InboxIcon, exact: false, badge: 'features' },
  { href: '/admin/donations', label: 'Donations', icon: HeartIcon, exact: false, badge: null },
  { href: '/admin/settings', label: 'Settings', icon: SlidersIcon, exact: false, badge: null },
  { href: '/admin/api', label: 'API reference', icon: CodeIcon, exact: false, badge: null },
] as const;

export function AdminNav({ counts }: { counts: NavCounts }) {
  const pathname = usePathname();

  return (
    <nav className="flex gap-1 overflow-x-auto lg:flex-col lg:overflow-visible">
      {LINKS.map(({ href, label, icon: Icon, exact, badge }) => {
        const active = exact ? pathname === href : pathname.startsWith(href);
        const count = badge ? counts[badge] : 0;

        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? 'page' : undefined}
            className={`flex shrink-0 items-center gap-2.5 rounded-xl px-3 py-2 text-sm transition-colors ${
              active
                ? 'bg-accent/10 font-medium text-accent'
                : 'text-muted hover:bg-surface-3 hover:text-text'
            }`}
          >
            <Icon />
            {label}
            {count > 0 && (
              // Neutral, not amber or sky: those two mean "drifted" and "aligned"
              // everywhere else on this site, and a count is neither.
              <span
                aria-label={`${count} needing attention`}
                className="ml-auto rounded-full bg-text px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-surface"
              >
                {count > 99 ? '99+' : count}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

function HomeIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.7">
      <path strokeLinejoin="round" d="M4 10.5 12 4l8 6.5V19a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 19v-8.5Z" />
    </svg>
  );
}

function BugIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.7">
      <rect x="7" y="8" width="10" height="12" rx="5" />
      <path strokeLinecap="round" d="M9 8a3 3 0 0 1 6 0M3 12h4m10 0h4M4 17.5l3-1.5m10 0 3 1.5M4.5 7l2.5 1m10 0 2.5-1" />
    </svg>
  );
}

function InboxIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.7">
      <path strokeLinejoin="round" d="M3 13h4l1.5 3h7L17 13h4M3 13l2.2-7.2A2 2 0 0 1 7.1 4.4h9.8a2 2 0 0 1 1.9 1.4L21 13v4.6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V13Z" />
    </svg>
  );
}

function SlidersIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.7">
      <path strokeLinecap="round" d="M4 7h10m4 0h2M4 17h4m4 0h8" />
      <circle cx="16" cy="7" r="2.2" />
      <circle cx="10" cy="17" r="2.2" />
    </svg>
  );
}

function CodeIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.7">
      <path strokeLinecap="round" strokeLinejoin="round" d="m8 7-5 5 5 5m8-10 5 5-5 5M14 4l-4 16" />
    </svg>
  );
}

function HeartIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.7">
      <path strokeLinejoin="round" d="M12 20s-7.2-4.4-8.9-9A4.6 4.6 0 0 1 12 7.4a4.6 4.6 0 0 1 8.9 3.6c-1.7 4.6-8.9 9-8.9 9Z" />
    </svg>
  );
}
