'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

/**
 * Change one submission's status.
 *
 * A plain select rather than a row of buttons: four states in a compact footer, and the
 * current one is visible without reading colours.
 */

const STATUSES = ['NEW', 'REVIEWED', 'RESOLVED', 'DISMISSED'] as const;

export function StatusControl({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState(false);

  const change = async (next: string) => {
    setError(false);

    const response = await fetch(`/api/admin/submissions/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: next }),
    }).catch(() => null);

    if (!response?.ok) {
      setError(true);
      return;
    }

    // Re-fetch the server component so counts and any active filter stay honest.
    startTransition(() => router.refresh());
  };

  return (
    <span className="flex items-center gap-1.5">
      {error && <span className="text-red-300">failed</span>}
      <select
        defaultValue={status}
        disabled={pending}
        onChange={(event) => void change(event.target.value)}
        className="rounded border border-white/10 bg-neutral-900 px-1.5 py-0.5 text-xs text-neutral-300 outline-none focus:border-sky-400/60 disabled:opacity-50"
      >
        {STATUSES.map((value) => (
          <option key={value} value={value}>
            {value.toLowerCase()}
          </option>
        ))}
      </select>
    </span>
  );
}
