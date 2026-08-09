import type { Metadata } from 'next';
import Link from 'next/link';
import { STORE_URL } from '@/lib/site';

export const metadata: Metadata = {
  title: 'How to use',
  description:
    'Install Subtitle Synchronizer, load a subtitle file, and fix its timing by clicking the line you can hear.',
};

/**
 * The guide.
 *
 * Numbered because it genuinely is a sequence — you cannot sync a track you have not
 * loaded. The numbering is the subtitle format's own cue index, which is also what the
 * panel shows, so the vocabulary matches what the user is looking at.
 */

const STEPS = [
  {
    title: 'Install it and open a video',
    body: 'Add it from the Chrome Web Store, then open the page you want to watch. Nothing appears yet: the extension only runs on sites you have allowed.',
    aside: null,
  },
  {
    title: 'Allow the site',
    body: 'Click the toolbar icon. The current domain is already filled in — press Add, and the panel appears over the player. There is no reload; it takes effect immediately.',
    aside: 'A handful of sites are allowed out of the box. Everything else is off until you say so.',
  },
  {
    title: 'Load a subtitle file',
    body: 'On the File tab, drop in an .srt or .vtt. It appears over the video straight away. If you have no file, the Find tab searches by title instead.',
    aside: 'Odd encodings are handled — if a file has ever given you question marks instead of accents, try it here.',
  },
  {
    title: 'Fix the timing',
    body: 'If the subtitles are early or late, open the Sync tab, wait for a line you can clearly hear, and click it in the list. The whole track moves to match.',
    aside: 'Or nudge in tenths of a second with G and H while the panel is open.',
  },
  {
    title: 'Fix subtitles that drift',
    body: 'If they start right but end late, the file was authored at a different framerate. Set anchor A on a line near the beginning, anchor B on one near the end, and press Fix drift. The rate is fitted from the two points.',
    aside: 'A 25 fps subtitle against a 23.976 fps video slips about four percent — ten seconds by the end of a film.',
  },
  {
    title: 'Make them readable',
    body: 'The Style tab sets font, size, colour, outline, shadow, background and position. It is saved once and applies everywhere.',
    aside: null,
  },
];

const SHORTCUTS = [
  ['Alt Shift S', 'Open or close the panel'],
  ['S', 'Sync to the line playing now'],
  ['G / H', 'Nudge the timing by a tenth of a second'],
  ['Shift S', 'Hide the panel'],
];

export default function HowToUsePage() {
  return (
    <main className="mx-auto max-w-3xl px-5 py-16">
      <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-accent">Guide</p>
      <h1 className="mt-3 font-display text-4xl font-bold tracking-tight text-balance">
        How to use it
      </h1>
      <p className="mt-4 text-pretty text-lg leading-relaxed text-muted">
        Six steps, and you only ever need the first four.
      </p>

      <ol className="mt-12 space-y-10">
        {STEPS.map((step, index) => (
          <li key={step.title} className="grid grid-cols-[auto_1fr] gap-x-5">
            <span
              className="font-mono text-sm text-muted tabular-nums"
              aria-hidden
            >
              {String(index + 1).padStart(2, '0')}
            </span>
            <div>
              <h2 className="font-display text-xl font-bold tracking-tight">{step.title}</h2>
              <p className="mt-2 text-pretty leading-relaxed text-text/90">{step.body}</p>
              {step.aside && (
                <p className="mt-3 border-l-2 border-line pl-4 text-sm leading-relaxed text-muted">
                  {step.aside}
                </p>
              )}
            </div>
          </li>
        ))}
      </ol>

      <section className="mt-16">
        <h2 className="font-display text-xl font-bold tracking-tight">Shortcuts</h2>
        <dl className="mt-4 divide-y divide-line rounded-2xl border border-line">
          {SHORTCUTS.map(([keys, what]) => (
            <div key={keys} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
              <dt className="font-mono text-xs text-accent">{keys}</dt>
              <dd className="text-sm text-muted">{what}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 text-sm text-muted">
          The single-letter ones work only while the panel is open, so they never collide with
          the player&rsquo;s own shortcuts.
        </p>
      </section>

      <section className="mt-16 rounded-2xl border border-line bg-surface-2 p-8">
        <h2 className="font-display text-xl font-bold tracking-tight">Still stuck?</h2>
        <p className="mt-2 text-pretty leading-relaxed text-muted">
          If a site does not work or the timing will not hold, say so — it is usually
          fixable, and the report tells me where to look.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link
            href="/report"
            className="rounded-xl bg-accent-solid px-5 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
          >
            Report a problem
          </Link>
          <a
            href={STORE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-xl border border-line px-5 py-2.5 text-sm font-medium transition-colors hover:border-accent hover:text-accent"
          >
            Add to Chrome
          </a>
        </div>
      </section>
    </main>
  );
}
