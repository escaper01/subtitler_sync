'use client';

import { signIn } from 'next-auth/react';

export function LoginButton() {
  return (
    <button
      type="button"
      onClick={() => void signIn('google', { callbackUrl: '/admin' })}
      className="w-full rounded-xl border border-line bg-surface-2 px-4 py-2.5 text-sm font-medium transition-colors hover:border-accent hover:text-accent"
    >
      Sign in with Google
    </button>
  );
}
