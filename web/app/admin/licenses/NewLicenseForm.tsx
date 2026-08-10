'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

const PRESETS = [
  { label: '7 days', days: 7 },
  { label: '30 days', days: 30 },
  { label: '365 days', days: 365 },
];

/**
 * Issue a licence by hand — a replacement for a lost key, or a gift.
 *
 * The key is shown once, here, and never again: only its hash is stored. So the copy says
 * so, and the value is left on screen until the admin navigates away.
 */
export function NewLicenseForm() {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [email, setEmail] = useState('');
  const [days, setDays] = useState(30);
  const [note, setNote] = useState('');
  const [issued, setIssued] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const field =
    'w-full rounded-xl border border-line bg-surface-2 px-3 py-2 text-sm outline-none focus:border-accent';

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setIssued(null);

    const response = await fetch('/api/admin/licenses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, days, note }),
    }).catch(() => null);

    setBusy(false);

    if (!response?.ok) {
      const body = (await response?.json().catch(() => null)) as { error?: string } | null;
      setError(body?.error ?? 'Could not issue that licence.');
      return;
    }

    const created = (await response.json()) as { key: string };
    setIssued(created.key);
    setNote('');
    startTransition(() => router.refresh());
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <label className="block">
        <span className="mb-1 block text-xs text-muted">Who it is for</span>
        <input
          type="email"
          required
          value={email}
          placeholder="them@example.com"
          onChange={(e) => setEmail(e.target.value)}
          className={field}
        />
      </label>

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

      <div className="flex gap-3">
        <label className="w-32">
          <span className="mb-1 block text-xs text-muted">Days</span>
          <input
            type="number"
            min={1}
            max={3650}
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className={field}
          />
        </label>
        <label className="flex-1">
          <span className="mb-1 block text-xs text-muted">Note — why</span>
          <input
            type="text"
            value={note}
            maxLength={200}
            onChange={(e) => setNote(e.target.value)}
            className={field}
          />
        </label>
      </div>

      {error && <p className="text-sm text-drift">{error}</p>}

      {issued && (
        <div className="rounded-xl border border-accent/40 bg-accent/[0.07] px-4 py-3">
          <p className="text-xs text-muted">
            Send them this now — it is stored as a hash and cannot be shown again.
          </p>
          <code className="mt-1 block font-mono text-sm break-all text-accent">{issued}</code>
        </div>
      )}

      <button
        type="submit"
        disabled={busy}
        className="rounded-xl bg-accent-solid px-5 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {busy ? 'Issuing…' : 'Issue a licence'}
      </button>
    </form>
  );
}
