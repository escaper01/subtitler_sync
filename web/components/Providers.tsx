'use client';

import { SessionProvider } from 'next-auth/react';

/**
 * Wraps the public site so `useSession()` works in the header.
 *
 * Only the site group needs it: `/admin` decides everything server-side in middleware and
 * has no client-side session reads.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>;
}
