import Link from 'next/link';
import { accountsSharingDeviceWith } from '@/lib/deviceSignal';

/**
 * Other accounts that have signed in from the same device.
 *
 * The point of the device signal: `TrialClaim` already stops a second trial on one address,
 * so trial farming happens through fresh Google accounts, and only a device link makes that
 * visible.
 *
 * Presented as evidence, never as a verdict. Shared computers, households, offices and
 * privacy browsers all produce matches between people who are genuinely different, so this
 * section suggests a look rather than an action — and every action beside it stays manual.
 */
export async function SharedDevices({ userId }: { userId: string }) {
  const shared = await accountsSharingDeviceWith(userId).catch(() => []);

  return (
    <section className="mt-10">
      <h2 className="font-display text-lg font-bold tracking-tight">
        Shared devices
        {shared.length > 0 && (
          <span className="ml-2 text-sm font-normal text-muted">
            {shared.length} other account{shared.length === 1 ? '' : 's'}
          </span>
        )}
      </h2>

      {shared.length === 0 ? (
        <p className="mt-2 text-sm text-muted">
          No other account has signed in from a device this one uses.
        </p>
      ) : (
        <>
          <ul className="mt-3 divide-y divide-line rounded-2xl border border-line">
            {shared.map((account) => (
              <li key={account.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
                <Link
                  href={`/admin/users/${account.id}`}
                  className="text-sm font-medium hover:text-accent"
                >
                  {account.email}
                </Link>
                <span className="font-mono text-xs text-muted">
                  joined {account.createdAt.toISOString().slice(0, 10)}
                </span>
                <span className="text-xs text-muted">
                  {account.sharedDevices} device{account.sharedDevices === 1 ? '' : 's'} in common
                </span>
                {account.status === 'BANNED' && (
                  <span className="rounded border border-drift/30 bg-drift/10 px-1.5 py-0.5 text-[11px] text-drift">
                    banned
                  </span>
                )}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs leading-relaxed text-muted">
            A match means one browser profile, not necessarily one person — a family, a shared
            laptop or an office all look like this. Worth checking alongside the signup dates and
            the search history before acting.
          </p>
        </>
      )}
    </section>
  );
}
