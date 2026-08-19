import { db } from '@/lib/db';
import { DonationsForm } from '@/app/admin/donations/DonationsForm';

export const dynamic = 'force-dynamic';

/**
 * Where the donation buttons are edited.
 *
 * This is the whole of "taking money" now. There is no payment provider and no checkout —
 * these are links to somewhere else that already knows how to accept it, and the point of
 * putting them in the database is that adding one is not a deploy.
 *
 * Every link here appears on the public site *and inside the extension panel*, which
 * renders in other people's pages. That is why the URLs are validated on the way in and
 * again on the way out — see lib/donate.ts.
 */
export default async function DonationsPage() {
  const links = await db.donationLink
    .findMany({ orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] })
    .catch(() => []);

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <h1 className="font-display text-2xl font-bold tracking-tight">Donations</h1>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        The buttons shown on the site and in the extension. The sentence above them, and
        whether the prompt appears at all, are on the{' '}
        <a href="/admin/settings" className="text-accent hover:underline">
          Settings
        </a>{' '}
        page — a link added here shows nowhere until the prompt is switched on there.
      </p>

      <div className="mt-8">
        <DonationsForm
          initial={links.map((link) => ({
            id: link.id,
            provider: link.provider,
            label: link.label,
            url: link.url,
            visible: link.visible,
          }))}
        />
      </div>
    </main>
  );
}
