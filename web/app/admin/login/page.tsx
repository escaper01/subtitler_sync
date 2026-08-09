import { LoginButton } from '@/app/admin/login/LoginButton';

/**
 * Sign-in. Outside the middleware matcher, or redirecting here would loop forever.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6">
      <h1 className="text-lg font-semibold text-white">Subtitle Synchronizer</h1>
      <p className="mt-1 text-sm text-neutral-500">Admin</p>

      {error && (
        <p className="mt-4 rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
          {error === 'AccessDenied'
            ? 'That account is not on the admin list.'
            : 'Sign-in failed. Try again.'}
        </p>
      )}

      <div className="mt-6">
        <LoginButton />
      </div>
    </main>
  );
}
