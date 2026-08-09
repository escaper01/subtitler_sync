'use client';

import { signIn } from 'next-auth/react';

export function LoginButton() {
  return (
    <button
      type="button"
      onClick={() => void signIn('google', { callbackUrl: '/admin' })}
      className="w-full rounded-lg bg-white px-4 py-2.5 text-sm font-medium text-neutral-900 transition-opacity hover:opacity-90"
    >
      Sign in with Google
    </button>
  );
}
