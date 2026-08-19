'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

interface Settings {
  enabled: boolean;
  heading: string;
  message: string;
  color: string;
  searchPerHour: number;
  searchPerDay: number;
}

export function SettingsForm({ initial }: { initial: Settings }) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [form, setForm] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const field =
    'w-full rounded-xl border border-line bg-surface-2 px-3 py-2 text-sm outline-none focus:border-accent';

  const patch = (change: Partial<Settings>) => {
    setForm((current) => ({ ...current, ...change }));
    setSaved(false);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setSaved(false);

    const response = await fetch('/api/admin/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    }).catch(() => null);

    setBusy(false);

    if (!response?.ok) {
      const body = (await response?.json().catch(() => null)) as { error?: string } | null;
      setError(body?.error ?? 'Could not save that.');
      return;
    }

    setSaved(true);
    startTransition(() => router.refresh());
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-line px-4 py-3">
        <input
          type="checkbox"
          checked={form.enabled}
          onChange={(e) => patch({ enabled: e.target.checked })}
          className="h-4 w-4 accent-[var(--accent-solid)]"
        />
        <span className="text-sm font-medium">Show the donation prompt</span>
      </label>

      <label className="block">
        <span className="mb-1 block text-xs text-muted">
          Heading
          <span className="ml-2 tabular-nums">{form.heading.length}/60</span>
        </span>
        <input
          type="text"
          maxLength={60}
          value={form.heading}
          onChange={(e) => patch({ heading: e.target.value })}
          className={field}
        />
      </label>

      <label className="block">
        <span className="mb-1 block text-xs text-muted">
          Message
          <span className="ml-2 tabular-nums">{form.message.length}/240</span>
        </span>
        <textarea
          rows={3}
          maxLength={240}
          value={form.message}
          onChange={(e) => patch({ message: e.target.value })}
          className={`${field} resize-y`}
        />
      </label>

      <label className="block w-fit">
        <span className="mb-1 block text-xs text-muted">Colour</span>
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={form.color}
            onChange={(e) => patch({ color: e.target.value })}
            className="h-9 w-12 cursor-pointer rounded-lg border border-line bg-transparent p-1"
          />
          <input
            type="text"
            value={form.color}
            onChange={(e) => patch({ color: e.target.value })}
            className={`${field} w-28 font-mono`}
          />
        </div>
      </label>

      <div>
        <span className="mb-1 block text-xs text-muted">How it will look</span>
        <div
          className="rounded-xl border px-4 py-3"
          style={{ borderColor: `${form.color}66`, backgroundColor: `${form.color}14` }}
        >
          {/* Text, never markup — these same strings render inside other people's pages. */}
          <p className="text-sm font-medium">{form.heading || 'No heading'}</p>
          <p className="mt-1 text-sm leading-relaxed">
            {form.message || 'Nothing to show yet.'}
          </p>
        </div>
      </div>

      <fieldset className="rounded-2xl border border-line p-4">
        <legend className="px-1 text-xs text-muted">Search limits</legend>
        <p className="text-xs leading-relaxed text-muted">
          Per extension install, with a looser bucket per IP address behind it. These are now
          the only thing standing in front of the search API — there is no licence check any
          more — so they are worth setting deliberately. Tightening them takes effect within
          a minute.
        </p>

        <div className="mt-3 grid grid-cols-2 gap-3">
          <label>
            <span className="mb-1 block text-xs text-muted">Searches / hour</span>
            <input
              type="number"
              min={1}
              value={form.searchPerHour}
              onChange={(e) => patch({ searchPerHour: Number(e.target.value) })}
              className={field}
            />
          </label>
          <label>
            <span className="mb-1 block text-xs text-muted">Searches / day</span>
            <input
              type="number"
              min={1}
              value={form.searchPerDay}
              onChange={(e) => patch({ searchPerDay: Number(e.target.value) })}
              className={field}
            />
          </label>
        </div>

        <p className="mt-3 text-xs leading-relaxed text-muted">
          Loading a subtitle also hits <code className="font-mono">/api/release</code> and{' '}
          <code className="font-mono">/api/download</code>, which carry their own allowance
          at three times these numbers — so a search limit of 60 does not mean 30 completed
          loads.
        </p>
      </fieldset>

      {error && <p className="text-sm text-drift">{error}</p>}
      {saved && <p className="text-sm text-accent">Saved.</p>}

      <button
        type="submit"
        disabled={busy}
        className="rounded-xl bg-accent-solid px-5 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {busy ? 'Saving…' : 'Save'}
      </button>
    </form>
  );
}
