import { db } from '@/lib/db';
import { safeColor } from '@/lib/donate';
import { SettingsForm } from '@/app/admin/settings/SettingsForm';

export const dynamic = 'force-dynamic';

/**
 * The numbers that used to be constants.
 *
 * This page used to carry prices and plans too. Those went with the paywall; what is left
 * is the donation prompt's wording and the rate limits — which matter more than they did,
 * because the limits are now the only thing in front of the search API.
 *
 * The donation *links* are edited at /admin/donations. The split is deliberate: the
 * sentence above the buttons is an editorial choice made once, and the buttons themselves
 * are a list that changes.
 */
export default async function SettingsPage() {
  const setting = await db.siteSetting
    .findUnique({ where: { id: 'singleton' } })
    .catch(() => null);

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <h1 className="font-display text-2xl font-bold tracking-tight">Settings</h1>

      <section className="mt-8">
        <h2 className="font-display text-lg font-bold tracking-tight">
          Donation prompt, and limits
        </h2>
        <p className="mt-1 text-sm leading-relaxed text-muted">
          The prompt appears on the site and in the extension panel, to everyone. The buttons
          beneath it are edited on the{' '}
          <a href="/admin/donations" className="text-accent hover:underline">
            Donations
          </a>{' '}
          page — with none set up, the prompt renders nothing however this is configured.
        </p>
        <div className="mt-5">
          <SettingsForm
            initial={{
              enabled: setting?.donateEnabled ?? false,
              heading: setting?.donateHeading ?? 'Support the extension',
              message:
                setting?.donateMessage ??
                'This is free and has no ads. If it saved you an evening, a coffee helps keep the server running.',
              color: safeColor(setting?.donateColor),
              searchPerHour: setting?.searchPerHour ?? 60,
              searchPerDay: setting?.searchPerDay ?? 300,
            }}
          />
        </div>
      </section>
    </main>
  );
}
