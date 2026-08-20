import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import Link from 'next/link';
import type { Metadata } from 'next';
import { STORE_URL } from '@/lib/site';

export const metadata: Metadata = {
  title: 'Download the full build',
  description:
    'The full build adds subtitle search and the series browser. Downloaded here and loaded unpacked, because it is not on the Chrome Web Store.',
};

export const dynamic = 'force-dynamic';

/** Where `SETUP.md` Part C step 4 says to drop the zip. */
const DOWNLOAD_DIR = 'public/downloads';

interface Build {
  file: string;
  sizeMb: string;
  builtAt: string;
}

/**
 * Whatever is actually in `public/downloads`, newest first.
 *
 * Read from disk rather than hardcoded. A download page whose link 404s is worse than one
 * that admits there is no build yet — and hardcoding the filename means the version in it
 * goes stale the first time somebody forgets to edit this file.
 */
function builds(): Build[] {
  try {
    const dir = join(process.cwd(), DOWNLOAD_DIR);
    return readdirSync(dir)
      .filter((file) => file.endsWith('.zip'))
      .map((file) => {
        const stat = statSync(join(dir, file));
        return {
          file,
          sizeMb: (stat.size / 1024 / 1024).toFixed(1),
          builtAt: stat.mtime.toISOString().slice(0, 10),
        };
      })
      .sort((a, b) => b.builtAt.localeCompare(a.builtAt) || b.file.localeCompare(a.file));
  } catch {
    // The directory need not exist until the first build is published.
    return [];
  }
}

export default function DownloadPage() {
  const available = builds();
  const latest = available[0];

  return (
    <main className="mx-auto max-w-3xl px-5 py-16">
      <p className="font-mono text-[11px] uppercase tracking-widest text-muted">
        Not on the Web Store
      </p>
      <h1 className="mt-3 font-display text-3xl font-bold tracking-tight sm:text-4xl">
        The full build
      </h1>
      <p className="mt-4 text-pretty text-lg leading-relaxed text-muted">
        Everything in the Web Store version, plus <strong>subtitle search</strong> and the{' '}
        <strong>series browser</strong> — pick a show, a season and an episode instead of
        typing the name each time.
      </p>

      <div className="mt-8 rounded-2xl border border-line bg-surface-2 p-6">
        {latest ? (
          <>
            <div className="flex flex-wrap items-center gap-4">
              <a
                href={`/downloads/${latest.file}`}
                download
                className="rounded-xl bg-accent-solid px-5 py-3 text-sm font-medium text-white transition-opacity hover:opacity-90"
              >
                Download {latest.file}
              </a>
              <span className="text-sm text-muted">
                {latest.sizeMb} MB · built {latest.builtAt}
              </span>
            </div>
            {available.length > 1 && (
              <details className="mt-4">
                <summary className="cursor-pointer text-sm text-muted hover:text-text">
                  Earlier builds
                </summary>
                <ul className="mt-2 space-y-1">
                  {available.slice(1).map((build) => (
                    <li key={build.file}>
                      <a
                        href={`/downloads/${build.file}`}
                        download
                        className="text-sm text-muted hover:text-accent"
                      >
                        {build.file}
                      </a>
                      <span className="ml-2 text-xs text-muted">
                        {build.sizeMb} MB · {build.builtAt}
                      </span>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </>
        ) : (
          <p className="text-pretty leading-relaxed text-muted">
            No build has been published here yet. The{' '}
            <a
              href={STORE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent hover:underline"
            >
              Web Store version
            </a>{' '}
            has the overlay, the sync tool and dual subtitles, and installs in one click.
          </p>
        )}
      </div>

      <section className="mt-12">
        <h2 className="font-display text-xl font-bold tracking-tight">Installing it</h2>
        <p className="mt-3 text-pretty leading-relaxed text-muted">
          Chrome only installs signed extensions from the Web Store, so this one is loaded
          the way developers load their own. It takes about a minute.
        </p>
        <ol className="mt-5 space-y-4">
          <Step n={1} title="Unzip it">
            Put the folder somewhere you will not delete by accident — Chrome loads it from
            that path every time it starts, so moving it later breaks the extension.
          </Step>
          <Step n={2} title="Open chrome://extensions">
            Paste that into the address bar. It cannot be reached from a link.
          </Step>
          <Step n={3} title="Turn on Developer mode">
            The toggle is at the top right.
          </Step>
          <Step n={4} title="Load unpacked">
            Press it and select the unzipped folder — the one containing{' '}
            <code className="font-mono text-sm">manifest.json</code>.
          </Step>
        </ol>
      </section>

      <section className="mt-12 rounded-2xl border border-drift/30 bg-drift/[0.06] p-6">
        <h2 className="font-display text-lg font-bold tracking-tight">
          Two things to know first
        </h2>
        <ul className="mt-3 space-y-3 text-pretty leading-relaxed text-muted">
          <li>
            <strong className="text-text">It does not update itself.</strong> The Web Store
            version does; this one does not. When there is a new build you will have to come
            back here and repeat the four steps.
          </li>
          <li>
            <strong className="text-text">Chrome will ask about developer mode.</strong>{' '}
            Every time it restarts, it may warn you about extensions loaded this way. That is
            Chrome being cautious about unpacked folders in general, not about this one in
            particular.
          </li>
        </ul>
      </section>

      <section className="mt-12">
        <h2 className="font-display text-xl font-bold tracking-tight">
          Can I have both installed?
        </h2>
        <p className="mt-3 text-pretty leading-relaxed text-muted">
          Yes. They are signed with different keys, so Chrome treats them as separate
          extensions and neither replaces the other. The full one is named{' '}
          <strong>Subtitle Synchronizer (Full)</strong> in your extensions list so you can
          tell them apart. Running both at once on the same page is not useful, though —
          turn one off in the toolbar popup.
        </p>
      </section>

      <section className="mt-12 flex flex-wrap gap-3">
        <Link
          href="/how-to-use"
          className="rounded-xl border border-line px-5 py-3 text-sm font-medium transition-colors hover:border-accent hover:text-accent"
        >
          Read the guide
        </Link>
        <Link
          href="/report"
          className="rounded-xl border border-line px-5 py-3 text-sm font-medium transition-colors hover:border-accent hover:text-accent"
        >
          Something not working?
        </Link>
      </section>
    </main>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-4">
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-line font-mono text-xs text-muted">
        {n}
      </span>
      <span>
        <span className="block font-medium">{title}</span>
        <span className="mt-1 block text-pretty leading-relaxed text-muted">{children}</span>
      </span>
    </li>
  );
}
