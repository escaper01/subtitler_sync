'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

const PRESETS = [
  { label: 'Trial · 7 days', days: 7 },
  { label: 'Month · 30 days', days: 30 },
  { label: 'Year · 365 days', days: 365 },
];

export function NewCodeForm() {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [days, setDays] = useState(30);
  const [uses, setUses] = useState(1);
  const [note, setNote] = useState('');
  const [made, setMade] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const field =
    'w-full rounded-xl border border-line bg-surface-2 px-3 py-2 text-sm outline-none focus:border-accent';

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setMade(null);

    const response = await fetch('/api/admin/codes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ days, maxRedemptions: uses, note }),
    }).catch(() => null);

    setBusy(false);

    if (!response?.ok) {
      const body = (await response?.json().catch(() => null)) as { error?: string } | null;
      setError(body?.error ?? 'Could not make that code.');
      return;
    }

    const created = (await response.json()) as { code: string };
    setMade(created.code);
    setNote('');
    startTransition(() => router.refresh());
  };

  return (
    <form onSubmit={submit} className="space-y-3">
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
        <label className="flex-1">
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
          <span className="mb-1 block text-xs text-muted">Uses</span>
          <input
            type="number"
            min={1}
            max={10000}
            value={uses}
            onChange={(e) => setUses(Number(e.target.value))}
            className={field}
          />
        </label>
      </div>

      <label className="block">
        <span className="mb-1 block text-xs text-muted">Note — who it is for</span>
        <input
          type="text"
          value={note}
          maxLength={200}
          onChange={(e) => setNote(e.target.value)}
          className={field}
        />
      </label>

      {error && <p className="text-sm text-drift">{error}</p>}

      {made && (
        <p className="rounded-xl border border-accent/40 bg-accent/[0.07] px-4 py-3">
          <span className="block text-xs text-muted">Send them this</span>
          <code className="font-mono text-lg tracking-wide text-accent">{made}</code>
        </p>
      )}

      <button
        type="submit"
        disabled={busy}
        className="rounded-xl bg-accent-solid px-5 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {busy ? 'Making…' : 'Make a code'}
      </button>
    </form>
  );
}
