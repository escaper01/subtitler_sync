'use client';

import { signIn } from 'next-auth/react';

export function SignInButton({ callbackUrl = '/account' }: { callbackUrl?: string }) {
  return (
    <button
      type="button"
      onClick={() => void signIn('google', { callbackUrl })}
      className="w-full rounded-xl border border-line bg-surface-2 px-4 py-2.5 text-sm font-medium transition-colors hover:border-accent hover:text-accent"
    >
      Continue with Google
    </button>
  );
}
