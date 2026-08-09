import { STORE_URL } from '@/lib/site';

/**
 * The hero.
 *
 * The demo is the argument: a caption that slides out of time, hangs there, and snaps back
 * onto the word. That is the problem this exists to solve, and showing it takes less space
 * than explaining it. Amber means drifted, sky means aligned — the same two colours mean
 * the same two things everywhere on the site.
 *
 * It is decorative, so it is hidden from screen readers and stilled by
 * `prefers-reduced-motion` (see globals.css).
 */
export function Hero() {
  return (
    <section className="mx-auto max-w-6xl px-5 pt-14 pb-16 sm:pt-20">
      <div className="grid items-center gap-12 lg:grid-cols-[1.05fr_1fr]">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted">
            Chrome extension
          </p>

          <h1 className="mt-4 font-display text-4xl leading-[1.08] font-bold tracking-tight text-balance sm:text-5xl">
            Subtitles that land on the word.
          </h1>

          <p className="mt-5 max-w-lg text-pretty text-lg leading-relaxed text-muted">
            Put subtitles on any video in your browser, then fix their timing by clicking the
            line you can hear. No re-encoding, no offset arithmetic, no separate player.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <a
              href={STORE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-xl bg-accent-solid px-5 py-3 text-sm font-medium text-white transition-opacity hover:opacity-90"
            >
              <ChromeMark />
              Add to Chrome — free
            </a>
            <a
              href="/how-to-use"
              className="rounded-xl border border-line px-5 py-3 text-sm font-medium transition-colors hover:border-accent hover:text-accent"
            >
              How it works
            </a>
          </div>

          <p className="mt-4 font-mono text-xs text-muted">
            Loading your own subtitle files is free, and stays free.
          </p>
        </div>

        <DriftDemo />
      </div>
    </section>
  );
}

function DriftDemo() {
  return (
    <div aria-hidden className="select-none">
      <div className="overflow-hidden rounded-2xl border border-line bg-frame shadow-2xl">
        {/* A film frame: letterboxed, dim, with a caption sitting where one really sits. */}
        <div className="relative aspect-[16/10]">
          <div className="absolute inset-x-0 top-0 h-[9%] bg-black/60" />
          <div className="absolute inset-x-0 bottom-0 h-[9%] bg-black/60" />

          <div className="absolute inset-0 grid place-items-center">
            <div className="h-24 w-24 rounded-full border border-white/[0.07]" />
          </div>

          <div className="absolute inset-x-0 bottom-[16%] flex justify-center px-6">
            <p className="animate-drift font-mono text-[13px] font-medium sm:text-sm">
              — I never said that.
            </p>
          </div>
        </div>

        {/* The transform in the subtitle format's own notation. */}
        <div className="flex items-center gap-3 border-t border-line/60 px-4 py-3 font-mono text-[11px]">
          <span className="text-drift">00:14:02,480</span>
          <span className="text-muted">--&gt;</span>
          <span className="text-accent">00:13:58,900</span>
          <span className="ml-auto text-muted">one click</span>
        </div>
      </div>
    </div>
  );
}

function ChromeMark() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="3.4" />
      <path d="M12 8.6h8M9 13.7l-4 6.9M15 13.7l-4 6.9" strokeLinecap="round" />
    </svg>
  );
}
