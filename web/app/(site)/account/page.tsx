import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/requireUser';
import { db } from '@/lib/db';
import { DeviceProbe } from '@/app/(site)/account/DeviceProbe';
import { SignOutButton } from '@/app/(site)/account/SignOutButton';

export const metadata: Metadata = {
  title: 'Your account',
  description: 'Your subscription and licence keys.',
};

// Entitlement changes must show immediately — a cached account page that still says
// "expired" after a renewal is a support email.
export const dynamic = 'force-dynamic';

export default async function AccountPage() {
  const user = await getSessionUser();
  if (!user) redirect('/signin?callbackUrl=/account');

  const licenses = await db.license.findMany({
    where: { userId: user.id, status: 'ACTIVE' },
    select: { keyHint: true, source: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  });

  const suspended = user.status !== 'ACTIVE';

  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      {!suspended && <DeviceProbe />}

      <div className="flex items-baseline justify-between gap-4">
        <h1 className="font-display text-2xl font-bold tracking-tight">Your account</h1>
        <SignOutButton />
      </div>
      <p className="mt-1 text-sm text-muted">{user.email}</p>

      {suspended ? (
        <div className="mt-8 rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3">
          <p className="text-sm font-medium text-red-200">This account has been suspended.</p>
          <p className="mt-1 text-sm text-muted">
            Subtitle search is disabled. If you think this is a mistake, send a note through the{' '}
            <a href="/report" className="underline hover:text-accent">
              report form
            </a>
            .
          </p>
        </div>
      ) : (
        <Subscription entitledUntil={user.entitledUntil} isEntitled={user.isEntitled} />
      )}

      <section className="mt-10">
        <h2 className="font-display text-lg font-semibold">Licence keys</h2>
        {licenses.length === 0 ? (
          <p className="mt-2 text-sm text-muted">
            No keys yet. One is issued when your subscription starts.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {licenses.map((license) => (
              <li
                key={license.keyHint}
                className="flex items-center justify-between gap-4 rounded-xl border border-line bg-surface-2 px-4 py-2.5"
              >
                <code className="font-mono text-sm">{license.keyHint}…</code>
                <span className="text-xs text-muted">
                  {license.source.toLowerCase()} ·{' '}
                  {license.createdAt.toLocaleDateString('en-GB', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-xs leading-relaxed text-muted">
          Only the first characters are shown. We store a hash of each key, not the key itself, so
          it cannot be recovered here — if you have lost one, a replacement can be issued.
        </p>
      </section>
    </main>
  );
}

function Subscription({
  entitledUntil,
  isEntitled,
}: {
  entitledUntil: Date | null;
  isEntitled: boolean;
}) {
  const formatted = entitledUntil?.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  if (isEntitled) {
    return (
      <div className="mt-8 rounded-xl border border-accent/30 bg-accent/10 px-4 py-3">
        <p className="text-sm font-medium">Active until {formatted}</p>
        <p className="mt-1 text-sm text-muted">Subtitle search is available in the extension.</p>
      </div>
    );
  }

  return (
    <div className="mt-8 rounded-xl border border-line bg-surface-2 px-4 py-3">
      <p className="text-sm font-medium">
        {entitledUntil === null ? 'No subscription' : `Expired on ${formatted}`}
      </p>
      <p className="mt-1 text-sm text-muted">
        <a href="/pricing" className="underline hover:text-accent">
          See the plans
        </a>{' '}
        to restore subtitle search. Loading your own subtitle files stays free.
      </p>
    </div>
  );
}
