'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * The dashboard's left-hand navigation.
 *
 * A client component only because the active item depends on the current path; everything
 * it links to is rendered on the server.
 */

const LINKS = [
  { href: '/admin', label: 'Submissions', icon: InboxIcon, exact: true },
  { href: '/admin/api', label: 'API reference', icon: CodeIcon, exact: false },
];

export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav className="flex gap-1 lg:flex-col">
      {LINKS.map(({ href, label, icon: Icon, exact }) => {
        const active = exact ? pathname === href : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? 'page' : undefined}
            className={`flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm transition-colors ${
              active
                ? 'bg-accent/10 font-medium text-accent'
                : 'text-muted hover:bg-surface-3 hover:text-text'
            }`}
          >
            <Icon />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

function InboxIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.7">
      <path strokeLinejoin="round" d="M3 13h4l1.5 3h7L17 13h4M3 13l2.2-7.2A2 2 0 0 1 7.1 4.4h9.8a2 2 0 0 1 1.9 1.4L21 13v4.6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V13Z" />
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
