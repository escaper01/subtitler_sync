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
 * `app/api/feedback/route.ts` and `prisma/schema.prisma` are the sources. If you change
 * what is stored, change this page in the same commit; a policy that overstates or
 * understates is worse than none, and the Chrome Web Store listing points here.
 *
 * The date below is shown to users, so update it when the substance changes.
 */

const UPDATED = '11 August 2026';

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-2xl px-5 py-16">
      <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted">Privacy</p>
      <h1 className="mt-3 font-display text-4xl font-bold tracking-tight text-balance">
        What this stores, and why
      </h1>
      <p className="mt-4 text-pretty text-lg leading-relaxed text-muted">
        Short version: subtitles you load yourself never leave your browser. Searching sends
        the title you typed, because that is the only way to look it up.
      </p>

      <Section title="If you never sign in">
        <p>
          Nothing about you is stored. The extension keeps your subtitle files, styling, timing
          adjustments and site list <strong>on your own machine</strong>, in the browser&rsquo;s
          extension storage. None of that is uploaded, and there is no account to attach it to.
        </p>
        <p>
          The extension runs only on sites you have added to its list. On every other page it
          does nothing at all.
        </p>
      </Section>

      <Section title="If you make an account">
        <p>
          Accounts are created by signing in with Google, on this website. There is no password —
          we never see one. From Google we receive your email address, your name and your profile
          picture, and nothing else.
        </p>
        <p>What is stored against that account:</p>
        <List
          items={[
            'Your email address, name and profile picture, as Google reports them.',
            'When your subscription runs to, and the record of each period that was granted.',
            'Your licence keys, as one-way hashes. The copy you were given is the only usable one.',
            'Which installations of the extension are using each key, so the device limit can be enforced.',
          ]}
        />
        <p>
          The extension itself still <strong>does not sign in</strong>. It sends only your licence
          key, so nothing you do while watching is tied to your Google identity.
        </p>
      </Section>

      <Section title="Your device, when you sign in">
        <p>
          When you sign in <strong>on this website</strong>, we record characteristics of the
          browser you signed in with: a fingerprint calculated by an open-source library, along
          with your time zone, screen size, platform and language settings. Your IP address is
          used to derive a one-way hash and is not itself stored.
        </p>
        <p>
          This is used for one purpose — noticing when several accounts belong to the same person,
          which is how free trials get farmed. It is not used for advertising, it is never shared,
          and it is never sold.
        </p>
        <p>
          The fingerprint is stored as a one-way hash, so accounts can be compared with each other
          but the record cannot be matched against a fingerprint collected anywhere else. Nothing
          is decided automatically by it: a match is only ever flagged for a person to look at.
        </p>
        <p>
          This happens on this website only. <strong>The extension never does this</strong> — not
          on any site you watch, not ever.
        </p>
      </Section>

      <Section title="When you search for subtitles">
        <p>Each search records:</p>
        <List
          items={[
            'The title you typed, the language you chose, and which page of results.',
            'Whether it succeeded, and how many results came back.',
            'A one-way hash of your IP address — not the address itself.',
            'An anonymous per-installation identifier.',
          ]}
        />
        <p>
          This exists to fix things that fail to find results, and to notice one account being
          shared by a crowd.
        </p>
        <p className="rounded-xl border border-line bg-surface-2 px-4 py-3">
          <strong>Be aware:</strong> a search history is a record of what you have been
          watching, and it is kept against your licence indefinitely. If that bothers you,
          you can ask for it to be deleted — see below — or use the extension without a key
          at all and load your own subtitle files, which records nothing.
        </p>
        <p>
          Searches are passed to <span className="font-mono text-sm">subtitlecat.com</span>,
          which is where the subtitles come from. Only the title and language go there; your
          identity does not. Their handling of that request is theirs, not ours.
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
          without them most reports cannot be acted on. That is a form you chose to submit.
        </p>
      </Section>

      <Section title="Paying">
        <p>
          There is currently no payment provider — subscriptions are arranged by hand. When one
          is in place it will be named here, and it will be the party that handles your card
          details: this service never sees them. What it receives is your email address, a
          subscription identifier, and the date your access runs to.
        </p>
      </Section>

      <Section title="How long any of it is kept">
        <List
          items={[
            'Your email, licence and subscription history: until you ask for it to be deleted.',
            'Search history: indefinitely, unless you ask for it to be deleted.',
            'Bug reports and feature requests: indefinitely, so the same issue is not investigated twice.',
            'Rate-limiting counters: hours to a day, then discarded automatically.',
          ]}
        />
        <p>
          One thing survives deletion by design: a one-way hash recording that an
          address has already used its free trial. It cannot be reversed into your email, and
          exists only so the trial cannot be taken repeatedly.
        </p>
      </Section>

      <Section title="Who else sees it">
        <p>
          Nobody. It is not sold, not shared with advertisers, and not used to build a profile.
          The people who can read it are whoever administers this service, and the hosting and
          database providers it runs on.
        </p>
      </Section>

      <Section title="Getting your data, or getting rid of it">
        <p>
          Ask, and it will be done: a copy of what is stored about you, or deletion of your
          record and its history. Use the{' '}
          <Link href="/report" className="text-accent hover:underline">
            report form
          </Link>{' '}
          and include the email address you signed in with.
        </p>
        <p>
          Deleting your account removes its device records along with it.
        </p>
        <p>
          You can also remove the key from the extension at any time, from its popup, which
          deletes it from your browser immediately.
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
