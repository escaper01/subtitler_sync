'use client';

import { useState } from 'react';

/**
 * The report / feature-request form.
 *
 * Only the message is required. Every extra field asked for costs submissions, and the
 * ones that matter most tend to come from people who would not have filled in a form of
 * five boxes.
 */
export function FeedbackForm({
  kind,
  placeholder,
  subjectLabel,
}: {
  kind: 'REPORT' | 'FEATURE';
  placeholder: string;
  subjectLabel: string;
}) {
  const [message, setMessage] = useState('');
  const [subject, setSubject] = useState('');
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = useState<string | null>(null);

  if (state === 'sent') {
    return (
      <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
        Thank you — that came through.
        {email ? ' I will reply if there is something to say.' : ''}
      </p>
    );
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setState('sending');

    try {
      const response = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, message, subject, email }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? 'That did not go through. Try again in a moment.');
        setState('idle');
        return;
      }

      setState('sent');
    } catch {
      setError('Could not reach the server. Check your connection and try again.');
      setState('idle');
    }
  };

  const field =
    'w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-neutral-100 outline-none placeholder:text-neutral-600 focus:border-sky-400/60';

  return (
    <form onSubmit={submit} className="space-y-3">
      <input
        type="text"
        value={subject}
        onChange={(e) => setSubject(e.target.value)}
        placeholder={subjectLabel}
        maxLength={200}
        className={field}
      />

      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder={placeholder}
        required
        rows={5}
        maxLength={4000}
        className={`${field} resize-y`}
      />

      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Email (optional — only if you want a reply)"
        maxLength={200}
        className={field}
      />

      {error && <p className="text-sm text-red-300">{error}</p>}

      <button
        type="submit"
        disabled={state === 'sending' || message.trim().length < 10}
        className="rounded-lg bg-sky-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {state === 'sending' ? 'Sending…' : 'Send'}
      </button>
    </form>
  );
}
