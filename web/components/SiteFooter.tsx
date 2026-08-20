import Link from 'next/link';
import { STORE_URL } from '@/lib/site';

export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-line">
      <div className="mx-auto grid max-w-6xl gap-8 px-5 py-12 sm:grid-cols-2 lg:grid-cols-4">
        <div className="lg:col-span-2">
          <p className="font-display text-sm font-bold">Subtitle Synchronizer</p>
          <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted">
            Subtitles for video that has none, and a fix for the ones that arrive at the wrong
            moment.
          </p>
        </div>

        <nav aria-label="Product">
          <p className="font-mono text-[11px] uppercase tracking-widest text-muted">Product</p>
          <ul className="mt-3 space-y-2 text-sm">
            <li>
              <a
                href={STORE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted transition-colors hover:text-accent"
              >
                Add to Chrome
              </a>
            </li>
            <li>
              <Link href="/donate" className="text-muted transition-colors hover:text-accent">
                Donate
              </Link>
            </li>
            <li>
              <Link href="/download" className="text-muted transition-colors hover:text-accent">
                Full build
              </Link>
            </li>
            <li>
              <Link href="/how-to-use" className="text-muted transition-colors hover:text-accent">
                How to use
              </Link>
            </li>
          </ul>
        </nav>

        <nav aria-label="Support">
          <p className="font-mono text-[11px] uppercase tracking-widest text-muted">Support</p>
          <ul className="mt-3 space-y-2 text-sm">
            <li>
              <Link href="/report" className="text-muted transition-colors hover:text-accent">
                Report a problem
              </Link>
            </li>
            <li>
              <Link
                href="/feature-request"
                className="text-muted transition-colors hover:text-accent"
              >
                Request a feature
              </Link>
            </li>
            <li>
              <Link href="/privacy" className="text-muted transition-colors hover:text-accent">
                Privacy
              </Link>
            </li>
          </ul>
        </nav>
      </div>

      <div className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-5 py-5 text-xs text-muted">
          <p>© {new Date().getFullYear()} Subtitle Synchronizer</p>
          <p className="sm:ml-auto">
            Overlays subtitle text on video you are already playing. It does not download,
            record or redistribute video.
          </p>
        </div>
      </div>
    </footer>
  );
}
