'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

interface Settings {
  enabled: boolean;
  message: string;
  color: string;
  url: string;
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
          onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
          className="h-4 w-4 accent-[var(--accent-solid)]"
        />
        <span className="text-sm font-medium">Show the prompt</span>
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
          onChange={(e) => setForm({ ...form, message: e.target.value })}
          className={`${field} resize-y`}
        />
      </label>

      <div className="flex flex-wrap gap-3">
        <label className="flex-1">
          <span className="mb-1 block text-xs text-muted">Link</span>
          <input
            type="url"
            value={form.url}
            placeholder="https://…"
            onChange={(e) => setForm({ ...form, url: e.target.value })}
            className={field}
          />
        </label>

        <label>
          <span className="mb-1 block text-xs text-muted">Colour</span>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={form.color}
              onChange={(e) => setForm({ ...form, color: e.target.value })}
              className="h-9 w-12 cursor-pointer rounded-lg border border-line bg-transparent p-1"
            />
            <input
              type="text"
              value={form.color}
              onChange={(e) => setForm({ ...form, color: e.target.value })}
              className={`${field} w-28 font-mono`}
            />
          </div>
        </label>
      </div>

      <div>
        <span className="mb-1 block text-xs text-muted">How it will look</span>
        <div
          className="rounded-xl border px-4 py-3"
          style={{ borderColor: `${form.color}66`, backgroundColor: `${form.color}14` }}
        >
          {/* Text, never markup — this same string is rendered inside other people's pages. */}
          <p className="text-sm leading-relaxed">
            {form.message || 'Nothing to show yet.'}
          </p>
          {form.url && (
            <span
              className="mt-2 inline-block rounded-lg px-3 py-1.5 text-xs font-medium text-white"
              style={{ backgroundColor: form.color }}
            >
              Donate
            </span>
          )}
        </div>
      </div>

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
