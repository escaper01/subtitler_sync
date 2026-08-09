import type { Metadata } from 'next';
import { SignInButton } from '@/app/(site)/signin/SignInButton';

export const metadata: Metadata = {
  title: 'Sign in',
  description: 'Sign in to Subtitle Synchronizer to use subtitle search.',
};

/**
 * Sign-in, for ordinary users. `/admin/login` is the dashboard's own door.
 *
 * Outside the middleware matcher, or redirecting here would loop.
 */
export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; callbackUrl?: string }>;
}) {
  const { error, callbackUrl } = await searchParams;

  return (
    <main className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center px-5 py-16">
      <h1 className="font-display text-3xl font-bold tracking-tight">Sign in</h1>
      <p className="mt-3 text-pretty leading-relaxed text-muted">
        Subtitle search needs an account. Loading your own subtitle files does not, and never
        will.
      </p>

      {error && <SignInError code={error} />}

      <div className="mt-8">
        <SignInButton callbackUrl={callbackUrl} />
      </div>

      <p className="mt-6 text-sm leading-relaxed text-muted">
        New accounts get {process.env.TRIAL_DAYS ?? 7} days of search to try it out.
      </p>
    </main>
  );
}

function SignInError({ code }: { code: string }) {
  // `Callback` and `OAuthCallback` are what NextAuth reports when our signIn callback
  // threw — which, since it writes to the database, usually means the database.
  const message =
    code === 'AccessDenied'
      ? 'That account cannot be signed in.'
      : code === 'Callback' || code === 'OAuthCallback'
        ? 'Something went wrong on our side. Try again in a moment.'
        : 'Sign-in failed. Try again.';

  return (
    <p className="mt-6 rounded-xl border border-drift/40 bg-drift/10 px-4 py-3 text-sm text-drift">
      {message}
    </p>
  );
}
