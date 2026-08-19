import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Privacy',
  description:
    'What Subtitle Synchronizer stores, why, how long for, and how to have it deleted.',
};

/**
 * The privacy policy.
 *
 * **Keep this true.** It is written from what the code actually does — `lib/searchLog.ts`,
 * `lib/callerId.ts`, `app/api/feedback/route.ts` and `prisma/schema.prisma` are the
 * sources. If you change what is stored, change this page in the same commit; a policy
 * that overstates or understates is worse than none, and the Chrome Web Store listing
 * points here.
 *
 * It got substantially shorter when the paywall was removed. Gone with it: accounts,
 * Google sign-in for customers, licence keys, device fingerprints, trial records and
 * anything about payment. Do not reintroduce a sentence here without the code to match.
 *
 * The date below is shown to users, so update it when the substance changes.
 */

const UPDATED = '20 August 2026';

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-2xl px-5 py-16">
      <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted">Privacy</p>
      <h1 className="mt-3 font-display text-4xl font-bold tracking-tight text-balance">
        What this stores, and why
      </h1>
      <p className="mt-4 text-pretty text-lg leading-relaxed text-muted">
        Short version: there is no account, nothing to sign in to, and subtitles you load
        yourself never leave your browser. Searching sends the title you typed, because that
        is the only way to look it up.
      </p>

      <Section title="There is no account">
        <p>
          The extension does not sign in to anything and holds no credential. There is no
          registration, no password, no licence key and no subscription — every feature is
          free, so there is nothing for an account to unlock and no customer record to keep.
        </p>
        <p>
          Your subtitle files, styling, timing adjustments and site list are kept{' '}
          <strong>on your own machine</strong>, in the browser&rsquo;s extension storage. None
          of it is uploaded, and there is nothing to attach it to.
        </p>
        <p>
          The extension runs only on sites you have added to its list. On every other page it
          does nothing at all.
        </p>
      </Section>

      <Section title="When you search for subtitles">
        <p>Searching is the one thing that leaves your browser. Each search records:</p>
        <List
          items={[
            'The title you typed, the language you chose, and which page of results.',
            'Whether it succeeded, and how many results came back.',
            'A one-way hash of your IP address — not the address itself.',
            'An anonymous per-installation identifier, generated in your browser.',
          ]}
        />
        <p>
          This exists for two reasons: to fix searches that fail to find anything, and to stop
          the service being used as somebody&rsquo;s free scraping backend. With no accounts,
          the installation identifier and the hashed address are the only way to tell one
          caller from another, so they are also what the rate limits are counted against.
        </p>
        <p className="rounded-xl border border-line bg-surface-2 px-4 py-3">
          <strong>Be aware:</strong> a search history is a record of what you have been
          watching. It is not linked to a name or an email address — there are none — but it is
          linked to an identifier that stays the same for as long as the extension is
          installed. If that bothers you, load your own subtitle files instead: that path
          records nothing at all.
        </p>
        <p>
          Searches are passed to <span className="font-mono text-sm">subtitlecat.com</span>,
          which is where the subtitles come from. Only the title and language go there; the
          identifier and the address hash do not. Their handling of that request is theirs,
          not ours.
        </p>
      </Section>

      <Section title="Which sites you visit">
        <p>
          <strong>Not collected.</strong> The extension does not report which sites you use it
          on, and searching does not send the page you are on.
        </p>
        <p>
          The one exception is deliberate and visible: if you send a bug report or a feature
          request, the form may include the site you were on and the extension version, because
          without them most reports cannot be acted on. That is a form you chose to submit, and
          it shows you what it is sending.
        </p>
      </Section>

      <Section title="Donations">
        <p>
          The donate buttons are ordinary links to services such as PayPal or Ko-fi. Following
          one takes you to them, and anything that happens after that is between you and them —
          this service is not told who donated, receives no payment details, and has no way to
          connect a donation to anything on this page.
        </p>
      </Section>

      <Section title="Signing in">
        <p>
          The only sign-in here is the administrator&rsquo;s, for the dashboard that reads bug
          reports. It is restricted to a fixed list of addresses. If you are not running this
          service, it does not involve you.
        </p>
      </Section>

      <Section title="How long any of it is kept">
        <List
          items={[
            'Search history: indefinitely, unless you ask for it to be deleted.',
            'Bug reports and feature requests: indefinitely, so the same issue is not investigated twice.',
            'Rate-limiting counters: hours to a day, then discarded automatically.',
          ]}
        />
        <p>
          Nothing survives a deletion request. The one-way hash that used to record a spent
          free trial is gone along with trials themselves.
        </p>
      </Section>

      <Section title="Who else sees it">
        <p>
          Nobody. It is not sold, not shared with advertisers, and not used to build a profile.
          The people who can read it are whoever administers this service, and the hosting and
          database providers it runs on.
        </p>
      </Section>

      <Section title="Getting rid of it">
        <p>
          Ask, and it will be done. Use the{' '}
          <Link href="/report" className="text-accent hover:underline">
            report form
          </Link>{' '}
          from inside the extension, which attaches your installation identifier
          automatically. That identifier is the only thing tying any record to you, so a
          request sent without it cannot be matched to anything.
        </p>
        <p>
          You can also cut the link yourself at any time by removing and reinstalling the
          extension, which generates a new identifier. That does not delete what was already
          recorded, but nothing recorded afterwards can be connected to it.
        </p>
      </Section>

      <Section title="Changes">
        <p>
          If what is collected changes, this page changes with it. It was last updated on{' '}
          {UPDATED}.
        </p>
      </Section>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="font-display text-xl font-bold tracking-tight">{title}</h2>
      <div className="mt-3 space-y-3 text-pretty leading-relaxed text-muted">{children}</div>
    </section>
  );
}

function List({ items }: { items: string[] }) {
  return (
    <ul className="space-y-2 border-l border-line pl-4">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}
