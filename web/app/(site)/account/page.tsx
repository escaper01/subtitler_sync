import type { Metadata } from 'next';
import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/authOptions';
import { db } from '@/lib/db';
import { isEntitled, LIFETIME_ENDS_AT } from '@/lib/entitlement';
import { DONATE_URL } from '@/lib/site';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Your account',
};

const SOURCE_LABEL: Record<string, string> = {
  TRIAL: 'Free trial',
  PATREON: 'Patreon',
  CODE: 'Redeemed code',
  ADMIN: 'Granted directly',
};

export default async function AccountPage() {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email?.toLowerCase();
  // Middleware already required a session; this is belt and braces for the type.
  if (!email) redirect('/signin?callbackUrl=/account');

  const user = await db.user.findUnique({
    where: { email },
    select: {
      status: true,
      entitledUntil: true,
      entitlementSource: true,
      createdAt: true,
      entitlements: {
        where: { revokedAt: null },
        orderBy: { endsAt: 'desc' },
        take: 20,
        select: { id: true, source: true, startsAt: true, endsAt: true, note: true },
      },
    },
  });

  if (!user) {
    return (
      <main className="mx-auto max-w-2xl px-5 py-16">
        <h1 className="font-display text-3xl font-bold tracking-tight">Your account</h1>
        <p className="mt-4 text-muted">
          We could not load your account. Sign out and back in, and if it keeps happening,
          say so on the report page.
        </p>
      </main>
    );
  }

  const entitled = isEntitled(user);
  const lifetime = user.entitledUntil?.getTime() === LIFETIME_ENDS_AT.getTime();

  return (
    <main className="mx-auto max-w-2xl px-5 py-16">
      <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted">Account</p>
      <h1 className="mt-3 font-display text-3xl font-bold tracking-tight">{email}</h1>

      <section
        className={`mt-8 rounded-2xl border p-6 ${
          entitled ? 'border-accent/40 bg-accent/[0.07]' : 'border-line bg-surface-2'
        }`}
      >
        <h2 className="font-display text-lg font-bold tracking-tight">
          {entitled ? 'Subtitle search is on' : 'Subtitle search is off'}
        </h2>

        <p className="mt-2 text-sm leading-relaxed text-muted">
          {entitled
            ? lifetime
              ? `${SOURCE_LABEL[user.entitlementSource ?? ''] ?? 'Access'} — no expiry.`
              : `${SOURCE_LABEL[user.entitlementSource ?? ''] ?? 'Access'} — ${daysLeft(user.entitledUntil!)} left, until ${formatDate(user.entitledUntil!)}.`
            : user.entitledUntil
              ? `It ran out on ${formatDate(user.entitledUntil)}.`
              : 'You have not had a subscription yet.'}
        </p>

        {!entitled && DONATE_URL && (
          <a
            href={DONATE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-block rounded-xl bg-accent-solid px-5 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
          >
            Support the project
          </a>
        )}
      </section>

      <p className="mt-4 text-sm leading-relaxed text-muted">
        Loading your own <code className="font-mono text-xs">.srt</code> or{' '}
        <code className="font-mono text-xs">.vtt</code> files is free and needs no account at
        all — this only covers searching for one.
      </p>

      <section className="mt-10">
        <h2 className="font-display text-lg font-bold tracking-tight">History</h2>
        {user.entitlements.length === 0 ? (
          <p className="mt-2 text-sm text-muted">Nothing yet.</p>
        ) : (
          <ul className="mt-4 divide-y divide-line rounded-2xl border border-line">
            {user.entitlements.map((row) => (
              <li key={row.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-3">
                <span className="text-sm font-medium">
                  {SOURCE_LABEL[row.source] ?? row.source}
                </span>
                <span className="font-mono text-xs text-muted">
                  {formatDate(row.startsAt)} —{' '}
                  {row.endsAt.getTime() === LIFETIME_ENDS_AT.getTime()
                    ? 'no expiry'
                    : formatDate(row.endsAt)}
                </span>
                {row.note && <span className="text-xs text-muted">{row.note}</span>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function daysLeft(until: Date): string {
  const days = Math.max(0, Math.ceil((until.getTime() - Date.now()) / (24 * 60 * 60 * 1000)));
  return `${days} day${days === 1 ? '' : 's'}`;
}
