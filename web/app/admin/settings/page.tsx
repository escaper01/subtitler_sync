import { db } from '@/lib/db';
import { safeColor } from '@/lib/announcement';
import { PlansForm } from '@/app/admin/settings/PlansForm';
import { SettingsForm } from '@/app/admin/settings/SettingsForm';

export const dynamic = 'force-dynamic';

/**
 * The numbers that used to be constants.
 *
 * Prices, limits and the upgrade prompt all live here because each is something you change
 * in response to an event — a promotion, someone hammering the API, a bad month — and a
 * deploy is the wrong way to do that.
 */
export default async function SettingsPage() {
  const [setting, plans] = await Promise.all([
    db.siteSetting.findUnique({ where: { id: 'singleton' } }).catch(() => null),
    db.plan.findMany({ orderBy: { sortOrder: 'asc' } }).catch(() => []),
  ]);

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <h1 className="font-display text-2xl font-bold tracking-tight">Settings</h1>

      <section className="mt-8">
        <h2 className="font-display text-lg font-bold tracking-tight">Plans</h2>
        <p className="mt-1 text-sm leading-relaxed text-muted">
          What the pricing page offers. Prices take effect immediately — the public pages are
          rendered per request. The checkout link is your payment provider&rsquo;s buy URL; a plan
          without one shows as &ldquo;coming soon&rdquo; rather than a button that goes nowhere.
        </p>
        <div className="mt-5">
          <PlansForm
            initial={plans.map((plan) => ({
              slug: plan.slug,
              name: plan.name,
              price: (plan.priceCents / 100).toFixed(2),
              days: plan.days,
              checkoutUrl: plan.checkoutUrl ?? '',
              blurb: plan.blurb ?? '',
              visible: plan.visible,
            }))}
          />
        </div>
      </section>

      <section className="mt-12">
        <h2 className="font-display text-lg font-bold tracking-tight">
          Upgrade prompt, and limits
        </h2>
        <p className="mt-1 text-sm leading-relaxed text-muted">
          The prompt appears on the site and in the extension panel, to people without a
          subscription. Subscribers never see it.
        </p>
        <div className="mt-5">
          <SettingsForm
            initial={{
              enabled: setting?.promptEnabled ?? false,
              message:
                setting?.promptMessage ??
                'Subtitle search keeps a server running. A subscription is what pays for it.',
              color: safeColor(setting?.promptColor),
              url: setting?.promptUrl ?? '',
              searchPerHour: setting?.searchPerHour ?? 60,
              searchPerDay: setting?.searchPerDay ?? 300,
              defaultDeviceLimit: setting?.defaultDeviceLimit ?? 2,
              trialDays: setting?.trialDays ?? 7,
            }}
          />
        </div>
      </section>
    </main>
  );
}
