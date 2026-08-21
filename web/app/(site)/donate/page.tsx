import Link from 'next/link';
import type { Metadata } from 'next';
import { donatePrompt } from '@/lib/donate';
import { DonateButtons } from '@/components/DonateButtons';
import { STORE_URL } from '@/lib/site';

export const metadata: Metadata = {
  title: 'Support the extension',
  description:
    'The extension is free and has no ads. If it has been useful, here is where you can help pay for the server.',
};

/**
 * Where `/pricing` used to be.
 *
 * There is nothing to buy, so this page has one job: say plainly that everything is free,
 * and give the people who want to help a way to. It must never read as a soft paywall —
 * nothing on this page is a condition of anything.
 *
 * The buttons come from `DonationLink` rows. With none configured the page still renders,
 * and says so, rather than showing an empty box.
 */
/** Per request, for the same reason as the home page — see `app/(site)/page.tsx`. */
export const dynamic = 'force-dynamic';

export default async function DonatePage() {
  const prompt = await donatePrompt();

  return (
    <main className="mx-auto max-w-3xl px-5 py-16">
      <p className="font-mono text-[11px] uppercase tracking-widest text-muted">
        No subscription, no account
      </p>
      <h1 className="mt-3 font-display text-3xl font-bold tracking-tight sm:text-4xl">
        {prompt.heading || 'Support the extension'}
      </h1>
      <p className="mt-4 text-pretty text-lg leading-relaxed text-muted">
        Every part of this is free: loading your own subtitles, fixing their timing, and
        searching for a track online. There is no paid tier, nothing is held back, and
        nothing on this page changes what the extension does.
      </p>

      {prompt.enabled && prompt.links.length > 0 ? (
        <div className="mt-10 rounded-2xl border border-line bg-surface-2 p-8">
          <p className="text-pretty leading-relaxed">
            {prompt.message ||
              'If it saved you an evening, a coffee helps keep the server running.'}
          </p>
          <div className="mt-6">
            <DonateButtons links={prompt.links} color={prompt.color} />
          </div>
        </div>
      ) : (
        <div className="mt-10 rounded-2xl border border-line bg-surface-2 p-8">
          <p className="text-pretty leading-relaxed text-muted">
            There is nowhere to donate right now. The extension is free either way — that
            was never the part in question.
          </p>
        </div>
      )}

      <section className="mt-12">
        <h2 className="font-display text-xl font-bold tracking-tight">Where the money goes</h2>
        <p className="mt-3 text-pretty leading-relaxed text-muted">
          A server, so that subtitle search keeps working. Searching goes through this site
          rather than straight to the subtitle source, which means the parsing can be fixed
          without every user installing an update — and it means there is something to pay
          for. Nothing else costs anything: the overlay, the sync tool and the styling all
          run entirely in your browser.
        </p>
      </section>

      <section className="mt-12 rounded-2xl border border-line p-8">
        <h2 className="font-display text-xl font-bold tracking-tight">
          Haven&rsquo;t installed it yet?
        </h2>
        <div className="mt-5 flex flex-wrap gap-3">
          <a
            href={STORE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-xl bg-accent-solid px-5 py-3 text-sm font-medium text-white transition-opacity hover:opacity-90"
          >
            Add to Chrome — free
          </a>
          <Link
            href="/how-to-use"
            className="rounded-xl border border-line px-5 py-3 text-sm font-medium transition-colors hover:border-accent hover:text-accent"
          >
            Read the guide
          </Link>
        </div>
      </section>
    </main>
  );
}
