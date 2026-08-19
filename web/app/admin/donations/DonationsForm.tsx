'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

/**
 * The donation links, edited as one list.
 *
 * The whole list is submitted at once and the server treats it as the truth — a row that
 * is not in the payload is deleted. That is what makes "remove" and "move up" ordinary
 * local edits rather than three separate endpoints, and it is why nothing here writes
 * until Save.
 */

interface Row {
  /** Null for a row that has not been saved yet. */
  id: string | null;
  provider: string;
  label: string;
  url: string;
  visible: boolean;
}

/** The ones with an icon. Anything else is accepted and renders with a generic one. */
const PROVIDERS = [
  { value: 'paypal', label: 'PayPal' },
  { value: 'kofi', label: 'Ko-fi' },
  { value: 'buymeacoffee', label: 'Buy Me a Coffee' },
  { value: 'patreon', label: 'Patreon' },
  { value: 'github', label: 'GitHub Sponsors' },
  { value: 'liberapay', label: 'Liberapay' },
  { value: 'custom', label: 'Something else' },
];

/** What a new row is prefilled with, so the common case is two fields, not four. */
const SUGGESTED_LABEL: Record<string, string> = {
  paypal: 'Donate with PayPal',
  kofi: 'Buy me a coffee',
  buymeacoffee: 'Buy me a coffee',
  patreon: 'Support on Patreon',
  github: 'Sponsor on GitHub',
  liberapay: 'Support on Liberapay',
  custom: 'Support the extension',
};

const MAX_LINKS = 12;

export function DonationsForm({ initial }: { initial: Row[] }) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [rows, setRows] = useState<Row[]>(initial);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const field =
    'w-full rounded-xl border border-line bg-surface-2 px-3 py-2 text-sm outline-none focus:border-accent';

  const touch = (next: Row[]) => {
    setRows(next);
    setSaved(false);
  };

  const patch = (index: number, change: Partial<Row>) => {
    touch(rows.map((row, i) => (i === index ? { ...row, ...change } : row)));
  };

  const add = () => {
    touch([
      ...rows,
      { id: null, provider: 'paypal', label: SUGGESTED_LABEL.paypal, url: '', visible: true },
    ]);
  };

  const remove = (index: number) => touch(rows.filter((_, i) => i !== index));

  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= rows.length) return;
    const next = [...rows];
    [next[index], next[target]] = [next[target], next[index]];
    touch(next);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setSaved(false);

    const response = await fetch('/api/admin/donations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ links: rows }),
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
      {rows.length === 0 && (
        <p className="rounded-2xl border border-dashed border-line px-4 py-8 text-center text-sm text-muted">
          No donation links yet. Nothing is shown to anyone until there is at least one.
        </p>
      )}

      {rows.map((row, index) => (
        <fieldset key={row.id ?? `new-${index}`} className="rounded-2xl border border-line p-4">
          <div className="flex flex-wrap items-end gap-3">
            <label className="w-44">
              <span className="mb-1 block text-xs text-muted">Where</span>
              <select
                value={row.provider}
                onChange={(e) => {
                  const provider = e.target.value;
                  // Only overwrite a label the user has not edited, so switching provider
                  // by accident does not throw away their wording.
                  const untouched = Object.values(SUGGESTED_LABEL).includes(row.label);
                  patch(index, {
                    provider,
                    label: untouched ? (SUGGESTED_LABEL[provider] ?? row.label) : row.label,
                  });
                }}
                className={field}
              >
                {PROVIDERS.map((provider) => (
                  <option key={provider.value} value={provider.value}>
                    {provider.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="min-w-48 flex-1">
              <span className="mb-1 block text-xs text-muted">
                Button text
                <span className="ml-2 tabular-nums">{row.label.length}/40</span>
              </span>
              <input
                type="text"
                maxLength={40}
                value={row.label}
                onChange={(e) => patch(index, { label: e.target.value })}
                className={field}
              />
            </label>
          </div>

          <label className="mt-3 block">
            <span className="mb-1 block text-xs text-muted">Link</span>
            <input
              type="url"
              value={row.url}
              placeholder="https://paypal.me/yourname"
              onChange={(e) => patch(index, { url: e.target.value })}
              className={field}
            />
          </label>

          <div className="mt-3 flex flex-wrap items-center gap-3">
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={row.visible}
                onChange={(e) => patch(index, { visible: e.target.checked })}
                className="h-4 w-4 accent-[var(--accent-solid)]"
              />
              Visible
            </label>

            <div className="ml-auto flex items-center gap-1">
              <SmallButton onClick={() => move(index, -1)} disabled={index === 0} label="Move up">
                ↑
              </SmallButton>
              <SmallButton
                onClick={() => move(index, 1)}
                disabled={index === rows.length - 1}
                label="Move down"
              >
                ↓
              </SmallButton>
              <button
                type="button"
                onClick={() => remove(index)}
                className="rounded-lg px-2.5 py-1.5 text-xs text-drift transition-colors hover:bg-drift/10"
              >
                Remove
              </button>
            </div>
          </div>
        </fieldset>
      ))}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={add}
          disabled={rows.length >= MAX_LINKS}
          className="rounded-xl border border-line px-4 py-2 text-sm transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
        >
          Add a link
        </button>

        {error && <p className="text-sm text-drift">{error}</p>}
        {saved && <p className="text-sm text-accent">Saved.</p>}

        <button
          type="submit"
          disabled={busy}
          className="ml-auto rounded-xl bg-accent-solid px-5 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {busy ? 'Saving…' : 'Save'}
        </button>
      </div>

      <p className="text-xs leading-relaxed text-muted">
        Removing a row deletes it when you save. To take a button down temporarily, untick
        Visible instead — the link is kept and comes back with one click.
      </p>
    </form>
  );
}

function SmallButton({
  onClick,
  disabled,
  label,
  children,
}: {
  onClick: () => void;
  disabled: boolean;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="rounded-lg border border-line px-2.5 py-1.5 text-xs transition-colors hover:border-accent disabled:opacity-30"
    >
      {children}
    </button>
  );
}
