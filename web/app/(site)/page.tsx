import Link from 'next/link';
import { Hero } from '@/components/Hero';
import { FeatureRow } from '@/components/FeatureRow';
import { FREE_FEATURES, SEARCH_FEATURES } from '@/lib/features';
import { DONATE_URL, STORE_URL } from '@/lib/site';

export default function Home() {
  return (
    <main>
      <Hero />

      <section id="features" className="mx-auto max-w-6xl px-5">
        <SectionHead
          eyebrow="Free, always"
          title="Everything you need to read along"
          lead="Loading your own subtitles and fixing their timing costs nothing and always will."
        />

        <div className="divide-y divide-line">
          {FREE_FEATURES.map((feature, index) => (
            <FeatureRow key={feature.name} feature={feature} flip={index % 2 === 1} />
          ))}
        </div>
      </section>

      <section className="mx-auto mt-20 max-w-6xl px-5">
        <SectionHead
          eyebrow="Subtitle search"
          title="When you have no subtitle file at all"
          lead="Search by title and load a result straight onto the video. Supported by donations — everything above stays free either way."
        />

        <div className="divide-y divide-line">
          {SEARCH_FEATURES.map((feature, index) => (
            <FeatureRow key={feature.name} feature={feature} flip={index % 2 === 1} />
          ))}
        </div>
      </section>

      <section className="mx-auto mt-20 max-w-6xl px-5">
        <div className="rounded-2xl border border-line bg-surface-2 p-8 sm:p-10">
          <h2 className="font-display text-2xl font-bold tracking-tight">Get it</h2>
          <p className="mt-3 max-w-xl text-pretty leading-relaxed text-muted">
            Install it, open a video, and press <Kbd>Alt</Kbd> <Kbd>Shift</Kbd> <Kbd>S</Kbd>.
            The panel opens over the player.
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
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
        </div>
      </section>

      {DONATE_URL && (
        <section className="mx-auto mt-6 max-w-6xl px-5">
          <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-line px-8 py-6">
            <div>
              <h2 className="font-display text-lg font-bold tracking-tight">Support it</h2>
              <p className="mt-1 max-w-xl text-pretty text-sm leading-relaxed text-muted">
                Built by one person, and the search runs on a server that costs money whether
                anyone uses it or not.
              </p>
            </div>
            <a
              href={DONATE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-auto rounded-xl border border-accent px-5 py-2.5 text-sm font-medium text-accent transition-colors hover:bg-accent hover:text-white"
            >
              Donate
            </a>
          </div>
        </section>
      )}

      <section className="mx-auto mt-6 grid max-w-6xl gap-4 px-5 sm:grid-cols-2">
        <CardLink
          href="/report"
          title="Something broken?"
          body="Tell me which film and which site, and what you expected instead."
        />
        <CardLink
          href="/feature-request"
          title="Want something added?"
          body="A site it should support, a language, a control you keep wishing existed."
        />
      </section>
    </main>
  );
}

function SectionHead({
  eyebrow,
  title,
  lead,
}: {
  eyebrow: string;
  title: string;
  lead: string;
}) {
  return (
    <div className="max-w-2xl border-b border-line pb-8">
      <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-accent">{eyebrow}</p>
      <h2 className="mt-3 font-display text-3xl font-bold tracking-tight text-balance">{title}</h2>
      <p className="mt-3 text-pretty leading-relaxed text-muted">{lead}</p>
    </div>
  );
}

function CardLink({ href, title, body }: { href: string; title: string; body: string }) {
  return (
    <Link
      href={href}
      className="group rounded-2xl border border-line p-6 transition-colors hover:border-accent"
    >
      <h3 className="font-display font-bold tracking-tight">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-muted">{body}</p>
      <span className="mt-3 inline-block font-mono text-xs text-accent">Open --&gt;</span>
    </Link>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded border border-line bg-surface-3 px-1.5 py-0.5 font-mono text-xs">
      {children}
    </kbd>
  );
}
