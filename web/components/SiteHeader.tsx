'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { ThemeToggle } from '@/components/ThemeToggle';
import { STORE_URL } from '@/lib/site';

const LINKS = [
  { href: '/how-to-use', label: 'How to use' },
  { href: '/report', label: 'Report a problem' },
  { href: '/feature-request', label: 'Request a feature' },
];

export function SiteHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-surface/85 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-5 py-3">
        <Link href="/" className="flex items-center gap-2.5" onClick={() => setOpen(false)}>
          <Mark />
          <span className="font-display text-[15px] font-bold tracking-tight">
            Subtitle Synchronizer
          </span>
        </Link>

        <nav className="ml-6 hidden items-center gap-1 md:flex">
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`rounded-lg px-2.5 py-1.5 text-sm transition-colors ${
                pathname === link.href
                  ? 'text-accent'
                  : 'text-muted hover:text-text'
              }`}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <ThemeToggle />
          <a
            href={STORE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="hidden rounded-lg bg-accent-solid px-3.5 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 sm:block"
          >
            Add to Chrome
          </a>
          <button
            type="button"
            onClick={() => setOpen(!open)}
            aria-label={open ? 'Close menu' : 'Open menu'}
            aria-expanded={open}
            className="grid h-9 w-9 place-items-center rounded-lg border border-line text-muted md:hidden"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
              {open ? (
                <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
              ) : (
                <path strokeLinecap="round" d="M4 7h16M4 12h16M4 17h16" />
              )}
            </svg>
          </button>
        </div>
      </div>

      {open && (
        <nav className="border-t border-line px-5 py-2 md:hidden">
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setOpen(false)}
              className="block rounded-lg px-2 py-2 text-sm text-muted hover:text-text"
            >
              {link.label}
            </Link>
          ))}
          <a
            href={STORE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 block rounded-lg bg-accent-solid px-3 py-2 text-center text-sm font-medium text-white sm:hidden"
          >
            Add to Chrome
          </a>
        </nav>
      )}
    </header>
  );
}

/** The extension's own icon, drawn rather than loaded: two subtitle lines on a dark tile. */
function Mark() {
  return (
    <svg viewBox="0 0 32 32" className="h-7 w-7" aria-hidden>
      <rect width="32" height="32" rx="7" fill="var(--frame)" />
      <rect x="8.3" y="14.7" width="15.4" height="3.8" rx="1.9" fill="#38bdf8" />
      <rect x="4.5" y="21.1" width="23" height="3.8" rx="1.9" fill="#38bdf8" />
    </svg>
  );
}
