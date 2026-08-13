import type { Metadata } from 'next';
import { db } from '@/lib/db';
import { TrialForm } from '@/app/(site)/pricing/TrialForm';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Pricing',
  description:
    'Subtitles you load yourself are free forever. Searching for them runs on a server, and a small subscription is what pays for it.',
};

function money(cents: number, currency: string): string {
  const amount = cents % 100 === 0 ? (cents / 100).toFixed(0) : (cents / 100).toFixed(2);
  return currency === 'USD' ? `$${amount}` : `${amount} ${currency}`;
}

const PER: Record<string, string> = { MONTH: '/month', YEAR: '/year', TRIAL: '' };

export default async function PricingPage() {
  const plans = await db.plan
    .findMany({ where: { visible: true }, orderBy: { sortOrder: 'asc' } })
    .catch(() => []);

  const trial = plans.find((plan) => plan.interval === 'TRIAL');
  const paid = plans.filter((plan) => plan.interval !== 'TRIAL');

  return (
    <main className="mx-auto max-w-3xl px-5 py-16">
      <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-accent">Pricing</p>
      <h1 className="mt-3 font-display text-4xl font-bold tracking-tight text-balance">
        Free where it can be, paid where it costs
      </h1>

      <div className="mt-6 space-y-4 text-pretty text-lg leading-relaxed text-muted">
        <p>
          Putting subtitles on a video happens entirely in your browser. Loading your own{' '}
          <code className="font-mono text-base">.srt</code> file, fixing its timing, styling
          it — none of that touches a server, so none of it costs anything, and it is free
          forever.
        </p>
        <p>
          <strong className="text-text">Searching is different.</strong> Every search runs on
          a machine that is switched on whether anyone uses it or not, fetching and parsing
          pages from a site that redesigns itself without warning. Somebody has to pay for
          the server, and somebody has to fix the parser the morning it breaks.
        </p>
        <p>
          That is what the subscription is for. It is deliberately cheap — the goal is for it
          to pay for itself, not to make anyone rich.
        </p>
      </div>

      <section className="mt-12">
        <div className="grid gap-4 sm:grid-cols-2">
          {paid.map((plan) => (
            <div key={plan.slug} className="rounded-2xl border border-line bg-surface-2 p-6">
              <h2 className="font-display text-lg font-bold tracking-tight">{plan.name}</h2>
              <p className="mt-2">
                <span className="font-display text-3xl font-bold">
                  {money(plan.priceCents, plan.currency)}
                </span>
                <span className="text-sm text-muted">{PER[plan.interval]}</span>
              </p>
              {plan.blurb && (
                <p className="mt-3 text-sm leading-relaxed text-muted">{plan.blurb}</p>
              )}

              {plan.checkoutUrl ? (
                <a
                  href={plan.checkoutUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-5 inline-block rounded-xl bg-accent-solid px-5 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
                >
                  Subscribe
                </a>
              ) : (
                // A plan with no checkout link is not ready. Saying so beats a button that
                // goes nowhere.
                <p className="mt-5 text-sm text-muted">Coming soon.</p>
              )}
            </div>
          ))}
        </div>

        <p className="mt-4 text-sm leading-relaxed text-muted">
          You get a licence key when your subscription starts. Paste it into the extension and
          that is the whole setup — the extension itself never signs in.
        </p>
      </section>

      {trial && (
        <section className="mt-12 rounded-2xl border border-accent/30 bg-accent/[0.06] p-6">
          <h2 className="font-display text-xl font-bold tracking-tight">
            Try it for {trial.days} days
          </h2>
          <p className="mt-2 text-pretty leading-relaxed text-muted">
            {trial.blurb ?? 'No card, no account. One per email address.'}
          </p>
          <div className="mt-5 max-w-md">
            <TrialForm />
          </div>
        </section>
      )}

      <section className="mt-12 rounded-2xl border border-line p-6">
        <h2 className="font-display text-lg font-bold tracking-tight">
          Already have a key?
        </h2>
        <p className="mt-2 text-pretty leading-relaxed text-muted">
          Click the extension icon in your browser toolbar, paste it in, and press Save. It
          works on {(await deviceLimit()) ?? 2} devices.
        </p>
      </section>

      <section className="mt-12">
        <h2 className="font-display text-lg font-bold tracking-tight">Questions people ask</h2>
        <dl className="mt-4 space-y-5">
          <Faq q="What happens if I cancel?">
            You keep what you paid for until the period ends, then search stops. Nothing else
            changes — your own subtitle files carry on working exactly as before.
          </Faq>
          <Faq q="I lost my key.">
            Sign in and check your account page — it lists the keys on your account. Only the
            first few characters are shown, because what is stored is a hash rather than the key
            itself, so if you have genuinely lost it, send a report and a replacement can be
            issued.
          </Faq>
          <Faq q="Can I use it on my laptop and my desktop?">
            Yes. A key works on {(await deviceLimit()) ?? 2} devices at once.
          </Faq>
          <Faq q="Is the free part going to stay free?">
            Yes. Loading your own subtitles costs nothing to run, so there is nothing to
            charge for.
          </Faq>
        </dl>
      </section>
    </main>
  );
}

async function deviceLimit(): Promise<number | null> {
  const { getSettings } = await import('@/lib/settings');
  return (await getSettings()).defaultDeviceLimit;
}

function Faq({ q, children }: { q: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="font-medium">{q}</dt>
      <dd className="mt-1 text-pretty leading-relaxed text-muted">{children}</dd>
    </div>
  );
}
