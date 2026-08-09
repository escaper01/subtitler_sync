'use client';

import { signIn } from 'next-auth/react';
import { useState } from 'react';

export function SignInButton({ callbackUrl }: { callbackUrl?: string }) {
  const [busy, setBusy] = useState(false);

  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => {
        setBusy(true);
        // Relative paths only — an open redirect here would let a phishing page bounce
        // someone straight back out of a real sign-in.
        const target = callbackUrl?.startsWith('/') ? callbackUrl : '/account';
        void signIn('google', { callbackUrl: target });
      }}
      className="w-full rounded-xl bg-accent-solid px-5 py-3 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
    >
      {busy ? 'Opening Google…' : 'Continue with Google'}
    </button>
  );
}
