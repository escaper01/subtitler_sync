import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { SignInButton } from '@/app/(site)/signin/SignInButton';
import { getSessionUser } from '@/lib/requireUser';
import { trialDays } from '@/lib/entitlement';

export const metadata: Metadata = {
  title: 'Sign in',
  description: 'Sign in to Subtitle Synchronizer.',
};

/**
 * The customer sign-in page, and where NextAuth sends every failed sign-in.
 *
 * Google is the only provider on purpose: it is the one identity we can trust to have
 * verified the address, and the address is what a `User` row is keyed on.
 */
export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; callbackUrl?: string }>;
}) {
  const { error, callbackUrl } = await searchParams;

  // Already signed in — nothing here to show them.
  const user = await getSessionUser();
  if (user) redirect(callbackUrl ?? '/account');

  return (
    <main className="mx-auto flex min-h-[60vh] max-w-sm flex-col justify-center px-6 py-16">
      <h1 className="font-display text-2xl font-bold tracking-tight">Sign in</h1>
      <p className="mt-2 text-sm text-muted">
        New accounts get {trialDays()} days of full access, one per email address.
      </p>

      {error && (
        <p className="mt-4 rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
          {error === 'AccessDenied'
            ? 'That account cannot be signed in to.'
            : 'Sign-in failed. Please try again.'}
        </p>
      )}

      <div className="mt-6">
        <SignInButton callbackUrl={callbackUrl ?? '/account'} />
      </div>

      <p className="mt-6 text-xs leading-relaxed text-muted">
        Signing in records your device characteristics to detect duplicate accounts. See the{' '}
        <a href="/privacy" className="underline hover:text-accent">
          privacy policy
        </a>
        .
      </p>
    </main>
  );
}
