'use client';

import { useState } from 'react';

/**
 * Request a trial key by email.
 *
 * The key is sent rather than shown, so the success state has to explain that — otherwise
 * people wait on this page for something that has already gone to their inbox.
 */
export function TrialForm() {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = useState<string | null>(null);

  if (state === 'sent') {
    return (
      <p className="rounded-xl border border-accent/40 bg-accent/[0.07] px-4 py-3 text-sm leading-relaxed">
        Sent. Check <strong>{email}</strong> for your key, then paste it into the extension.
        If it does not turn up in a minute, look in your spam folder.
      </p>
    );
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setState('sending');

    const response = await fetch('/api/trial', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    }).catch(() => null);

    if (!response?.ok) {
      const body = (await response?.json().catch(() => null)) as { error?: string } | null;
      setError(body?.error ?? 'That did not go through. Try again in a moment.');
      setState('idle');
      return;
    }

    setState('sent');
  };

  return (
    <form onSubmit={submit} className="flex flex-wrap gap-2">
      <input
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@example.com"
        maxLength={200}
        className="min-w-48 flex-1 rounded-xl border border-line bg-surface-2 px-3.5 py-2.5 text-sm outline-none placeholder:text-muted/70 focus:border-accent"
      />
      <button
        type="submit"
        disabled={state === 'sending' || email.trim().length < 5}
        className="rounded-xl bg-accent-solid px-5 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {state === 'sending' ? 'Sending…' : 'Email me a key'}
      </button>

      {error && <p className="w-full text-sm text-drift">{error}</p>}
    </form>
  );
}
