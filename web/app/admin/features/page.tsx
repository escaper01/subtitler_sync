import { SubmissionList } from '@/app/admin/SubmissionList';

export const dynamic = 'force-dynamic';

export default async function FeaturesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <h1 className="font-display text-2xl font-bold tracking-tight">Feature requests</h1>
      <p className="mt-1 text-sm text-muted">What people have asked for.</p>

      <SubmissionList kind="FEATURE" status={status} basePath="/admin/features" />
    </main>
  );
}
