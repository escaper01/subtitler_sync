'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

const PRESETS = [
  { label: '7 days', days: 7 },
  { label: '30 days', days: 30 },
  { label: '365 days', days: 365 },
];

/**
 * Grant, revoke, ban.
 *
 * Granting is the common one — a supporter paid by some route the webhook never saw.
 * Banning is deliberately last and asks first, because it takes access away from someone
 * who may have paid for it.
 */
export function UserActions({ userId, banned }: { userId: string; banned: boolean }) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [days, setDays] = useState(30);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const send = async (body: Record<string, unknown>, success: string) => {
    setBusy(true);
    setError(null);
    setMessage(null);

    const response = await fetch(`/api/admin/users/${userId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).catch(() => null);

    setBusy(false);

    if (!response?.ok) {
      const failure = (await response?.json().catch(() => null)) as { error?: string } | null;
      setError(failure?.error ?? 'That did not work.');
      return;
    }

    setMessage(success);
    startTransition(() => router.refresh());
  };

  return (
    <div className="space-y-4 rounded-2xl border border-line p-5">
      <div>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((preset) => (
            <button
              key={preset.days}
              type="button"
              onClick={() => setDays(preset.days)}
              className={`rounded-lg border px-2.5 py-1 text-xs transition-colors ${
                days === preset.days
                  ? 'border-accent/40 bg-accent/10 text-accent'
                  : 'border-line text-muted hover:text-text'
              }`}
            >
              {preset.label}
            </button>
          ))}
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <input
            type="number"
            min={1}
            max={3650}
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="w-24 rounded-xl border border-line bg-surface-2 px-3 py-2 text-sm outline-none focus:border-accent"
          />
          <input
            type="text"
            value={note}
            maxLength={200}
            placeholder="Why — this is kept on the record"
            onChange={(e) => setNote(e.target.value)}
            className="min-w-0 flex-1 rounded-xl border border-line bg-surface-2 px-3 py-2 text-sm outline-none focus:border-accent"
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => void send({ action: 'grant', days, note }, `Gave them ${days} days.`)}
            className="rounded-xl bg-accent-solid px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            Give access
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 border-t border-line pt-4">
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            if (!confirm('Revoke every active period for this account?')) return;
            void send({ action: 'revoke' }, 'Revoked their access.');
          }}
          className="rounded-xl border border-line px-4 py-2 text-sm transition-colors hover:border-drift hover:text-drift disabled:opacity-50"
        >
          Revoke access
        </button>

        <button
          type="button"
          disabled={busy}
          onClick={() => {
            const next = !banned;
            if (next && !confirm('Ban this account? Every device is signed out immediately.')) {
              return;
            }
            void send(
              { action: next ? 'ban' : 'unban' },
              next ? 'Banned, and signed out everywhere.' : 'Unbanned.',
            );
          }}
          className="rounded-xl border border-line px-4 py-2 text-sm transition-colors hover:border-drift hover:text-drift disabled:opacity-50"
        >
          {banned ? 'Unban' : 'Ban'}
        </button>
      </div>

      {message && <p className="text-sm text-accent">{message}</p>}
      {error && <p className="text-sm text-drift">{error}</p>}
    </div>
  );
}
