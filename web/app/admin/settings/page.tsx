import { db } from '@/lib/db';
import { safeColor } from '@/lib/announcement';
import { SettingsForm } from '@/app/admin/settings/SettingsForm';

export const dynamic = 'force-dynamic';

/**
 * The donation prompt.
 *
 * Editable here rather than in code because it is the sort of thing worth changing on a
 * whim, and every code change to the extension costs days of Web Store review.
 */
export default async function SettingsPage() {
  const setting = await db.siteSetting
    .findUnique({ where: { id: 'singleton' } })
    .catch(() => null);

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <h1 className="font-display text-2xl font-bold tracking-tight">Settings</h1>

      <section className="mt-8">
        <h2 className="font-display text-lg font-bold tracking-tight">Donation prompt</h2>
        <p className="mt-1 text-sm leading-relaxed text-muted">
          Shown on the site and inside the extension panel, to people without a
          subscription. Subscribers never see it — they have already paid.
        </p>

        <div className="mt-5">
          <SettingsForm
            initial={{
              enabled: setting?.donationEnabled ?? false,
              message:
                setting?.donationMessage ??
                'This extension is free. If it saved you an evening, consider chipping in.',
              color: safeColor(setting?.donationColor),
              url: setting?.donationUrl ?? '',
            }}
          />
        </div>
      </section>
    </main>
  );
}
