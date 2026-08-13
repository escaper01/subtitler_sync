'use client';

import { signOut } from 'next-auth/react';

export function SignOutButton() {
  return (
    <button
      type="button"
      onClick={() => void signOut({ callbackUrl: '/' })}
      className="shrink-0 text-sm text-muted transition-colors hover:text-accent"
    >
      Sign out
    </button>
  );
}
