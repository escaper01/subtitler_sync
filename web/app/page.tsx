import type { Metadata } from 'next';
import { FeedbackForm } from '@/components/FeedbackForm';

export const metadata: Metadata = {
  title: 'Subtitle Synchronizer',
  description:
    'Add subtitles to any video in your browser: load your own SRT/VTT or find one online, then fix the timing with a click.',
};

/** Kept in one place so the page and the store listing cannot drift apart. */
const FREE = [
  ['Your own subtitle files', 'Drop in any .srt or .vtt and it appears over the video.'],
  ['Click-to-sync', 'Click the line being spoken now and the whole track snaps into place.'],
  [
    'Drift correction',
    'Subtitles that start right and end ten seconds late are a framerate mismatch. Mark one line near the start and one near the end and it fits the rate.',
  ],
  ['Full styling', 'Font, size, colour, outline, shadow, background, position — all of it.'],
  ['Works in fullscreen', 'The panel and the subtitles stay put when the player takes over the screen.'],
  ['Per-site control', 'It runs only on the sites you allow, and nowhere else.'],
  ['Remembers each film', 'Your subtitle and its timing come back when you return to it.'],
];

const PAID = [
  ['Search by title', 'Type a film or series name and get subtitles without leaving the page.'],
  ['31 languages', 'Pick the one you read in; results are filtered to it.'],
  ['One-click loading', 'Choose a result and it loads straight onto the video, already parsed.'],
  [
    'Matched to your release',
    'Results are listed by the video file they were timed against — pick the one matching yours and it needs no syncing at all.',
  ],
];

export default function Home() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight text-white">
          Subtitle Synchronizer
        </h1>
        <p className="mt-3 text-pretty text-lg text-neutral-400">
          Subtitles for video that does not have any — and a fix for the ones that are
          out of sync.
        </p>
      </header>

      <section className="mt-10 rounded-xl border border-white/10 bg-white/[0.03] p-5">
        <h2 className="text-sm font-medium text-white">How it works</h2>
        <p className="mt-2 text-sm leading-relaxed text-neutral-400">
          It draws the subtitles over the player itself, driven by the video&rsquo;s own clock —
          nothing is downloaded, converted or re-hosted, and the video is never touched. When a
          track is mistimed you fix it by clicking the line you can hear, rather than by guessing
          at an offset.
        </p>
      </section>

      <Features title="Free, always" items={FREE} />

      <Features
        title="Subtitle search"
        items={PAID}
        note="Supported by donations. Everything above stays free whether you give anything or not."
      />

      <section className="mt-12 rounded-xl border border-sky-400/20 bg-sky-500/[0.07] p-5">
        <h2 className="text-lg font-medium text-white">Support it</h2>
        <p className="mt-2 text-sm leading-relaxed text-neutral-300">
          This is built and maintained by one person, and the search runs on a server that costs
          money whether anyone uses it or not. If it saved you an evening of fiddling with
          timings, that is what donations are for.
        </p>
        <a
          href={process.env.NEXT_PUBLIC_DONATE_URL ?? '#'}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 inline-block rounded-lg bg-sky-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-sky-400"
        >
          Donate
        </a>
      </section>

      <section className="mt-12">
        <h2 className="text-lg font-medium text-white">Something broken?</h2>
        <p className="mt-1 text-sm text-neutral-400">
          Tell me which film and which site, and what you expected to happen.
        </p>
        <div className="mt-4">
          <FeedbackForm
            kind="REPORT"
            subjectLabel="Which film or site? (optional)"
            placeholder="What happened, and what you expected instead."
          />
        </div>
      </section>

      <section className="mt-12">
        <h2 className="text-lg font-medium text-white">Want something added?</h2>
        <p className="mt-1 text-sm text-neutral-400">
          A site it should support, a language, a control you keep wishing existed.
        </p>
        <div className="mt-4">
          <FeedbackForm
            kind="FEATURE"
            subjectLabel="In one line (optional)"
            placeholder="What you would like it to do, and why it would help."
          />
        </div>
      </section>

      <footer className="mt-16 border-t border-white/10 pt-6 text-xs text-neutral-600">
        Subtitle Synchronizer overlays subtitle text on video you are already playing. It does
        not download, record or redistribute video.
      </footer>
    </main>
  );
}

function Features({
  title,
  items,
  note,
}: {
  title: string;
  items: string[][];
  note?: string;
}) {
  return (
    <section className="mt-12">
      <h2 className="text-lg font-medium text-white">{title}</h2>
      {note && <p className="mt-1 text-sm text-neutral-500">{note}</p>}

      <dl className="mt-4 grid gap-4 sm:grid-cols-2">
        {items.map(([name, description]) => (
          <div key={name} className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <dt className="text-sm font-medium text-white">{name}</dt>
            <dd className="mt-1 text-sm leading-relaxed text-neutral-400">{description}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
