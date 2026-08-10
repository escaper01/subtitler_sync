'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

export interface PlanRow {
  slug: string;
  name: string;
  /** Whole currency units, as typed. Converted to cents on save. */
  price: string;
  days: number;
  checkoutUrl: string;
  blurb: string;
  visible: boolean;
}

export function PlansForm({ initial }: { initial: PlanRow[] }) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [plans, setPlans] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const field =
    'w-full rounded-lg border border-line bg-surface-2 px-2.5 py-1.5 text-sm outline-none focus:border-accent';

  const patch = (slug: string, change: Partial<PlanRow>) => {
    setPlans((rows) => rows.map((row) => (row.slug === slug ? { ...row, ...change } : row)));
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
      body: JSON.stringify({
        section: 'plans',
        plans: plans.map((plan) => ({
          slug: plan.slug,
          name: plan.name,
          // Rounded, not truncated: 1.995 typed into a price field means 2.00.
          priceCents: Math.round(Number(plan.price) * 100),
          days: plan.days,
          checkoutUrl: plan.checkoutUrl,
          blurb: plan.blurb,
          visible: plan.visible,
        })),
      }),
    }).catch(() => null);

    setBusy(false);

    if (!response?.ok) {
      const body = (await response?.json().catch(() => null)) as { error?: string } | null;
      setError(body?.error ?? 'Could not save the plans.');
      return;
    }

    setSaved(true);
    startTransition(() => router.refresh());
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      {plans.map((plan) => (
        <div key={plan.slug} className="rounded-2xl border border-line p-4">
          <div className="flex items-center gap-3">
            <input
              type="text"
              value={plan.name}
              maxLength={60}
              onChange={(e) => patch(plan.slug, { name: e.target.value })}
              className={`${field} flex-1 font-medium`}
            />
            <label className="flex shrink-0 cursor-pointer items-center gap-2 text-xs text-muted">
              <input
                type="checkbox"
                checked={plan.visible}
                onChange={(e) => patch(plan.slug, { visible: e.target.checked })}
                className="h-3.5 w-3.5 accent-[var(--accent-solid)]"
              />
              shown
            </label>
          </div>

          <div className="mt-3 flex flex-wrap gap-3">
            <label className="w-28">
              <span className="mb-1 block text-xs text-muted">Price</span>
              <input
                type="number"
                min={0}
                step="0.01"
                value={plan.price}
                onChange={(e) => patch(plan.slug, { price: e.target.value })}
                className={field}
              />
            </label>
            <label className="w-28">
              <span className="mb-1 block text-xs text-muted">Days</span>
              <input
                type="number"
                min={1}
                max={3650}
                value={plan.days}
                onChange={(e) => patch(plan.slug, { days: Number(e.target.value) })}
                className={field}
              />
            </label>
            <label className="min-w-48 flex-1">
              <span className="mb-1 block text-xs text-muted">
                Checkout link {plan.slug === 'trial' && '— not used for the trial'}
              </span>
              <input
                type="url"
                value={plan.checkoutUrl}
                placeholder="https://…lemonsqueezy.com/buy/…"
                onChange={(e) => patch(plan.slug, { checkoutUrl: e.target.value })}
                className={field}
              />
            </label>
          </div>

          <label className="mt-3 block">
            <span className="mb-1 block text-xs text-muted">One line about it</span>
            <input
              type="text"
              value={plan.blurb}
              maxLength={200}
              onChange={(e) => patch(plan.slug, { blurb: e.target.value })}
              className={field}
            />
          </label>
        </div>
      ))}

      {error && <p className="text-sm text-drift">{error}</p>}
      {saved && <p className="text-sm text-accent">Saved.</p>}

      <button
        type="submit"
        disabled={busy}
        className="rounded-xl bg-accent-solid px-5 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {busy ? 'Saving…' : 'Save plans'}
      </button>
    </form>
  );
}
