import { fail, json } from '@/lib/api';
import { safeColor, safeMessage, safeUrl } from '@/lib/announcement';
import { db } from '@/lib/db';
import { requireAdmin } from '@/lib/requireAdmin';
import { invalidateSettings } from '@/lib/settings';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * `POST /api/admin/settings` — the upgrade prompt, the limits, and the plans.
 *
 * Everything is validated on the way in as well as on the way out. The prompt's text and
 * colour are rendered by the extension inside pages we do not control, so that validation
 * is not politeness — it is the boundary.
 */
export async function POST(request: Request): Promise<Response> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail('Send JSON', 400);
  }

  const input = (body ?? {}) as Record<string, unknown>;

  if (input.section === 'plans') return savePlans(input);
  return saveSettings(input);
}

async function saveSettings(input: Record<string, unknown>): Promise<Response> {
  const message = safeMessage(typeof input.message === 'string' ? input.message : '');
  if (input.enabled === true && message.length < 10) {
    return fail('Write a message before switching the prompt on', 400);
  }

  const rawColor = typeof input.color === 'string' ? input.color : '';
  if (rawColor && safeColor(rawColor, '') === '') {
    return fail('Colour must look like #38bdf8', 400);
  }

  const rawUrl = typeof input.url === 'string' ? input.url.trim() : '';
  if (rawUrl && safeUrl(rawUrl) === null) {
    return fail('That link must be a http or https URL', 400);
  }

  // Bounded rather than merely positive: a typo of 100000 searches an hour is not a limit,
  // and a device limit of 0 would lock out every customer at once.
  const searchPerHour = whole(input.searchPerHour, 1, 100_000);
  const searchPerDay = whole(input.searchPerDay, 1, 1_000_000);
  const defaultDeviceLimit = whole(input.defaultDeviceLimit, 1, 100);
  const trialDays = whole(input.trialDays, 1, 365);

  if (searchPerHour === null || searchPerDay === null) {
    return fail('Search limits must be whole numbers', 400);
  }
  if (defaultDeviceLimit === null) return fail('Devices must be between 1 and 100', 400);
  if (trialDays === null) return fail('Trial days must be between 1 and 365', 400);
  if (searchPerDay < searchPerHour) {
    return fail('The daily limit cannot be lower than the hourly one', 400);
  }

  const data = {
    promptEnabled: input.enabled === true,
    promptMessage: message,
    promptColor: safeColor(rawColor),
    promptUrl: safeUrl(rawUrl),
    searchPerHour,
    searchPerDay,
    defaultDeviceLimit,
    trialDays,
  };

  await db.siteSetting.upsert({
    where: { id: 'singleton' },
    update: data,
    create: { id: 'singleton', ...data },
  });

  // The gate caches these for a minute; clear it so a tightened limit bites immediately.
  invalidateSettings();

  return json({ ok: true });
}

/** Prices, in whole currency units on the way in and cents in the database. */
async function savePlans(input: Record<string, unknown>): Promise<Response> {
  const plans = Array.isArray(input.plans) ? input.plans : null;
  if (!plans) return fail('Send a list of plans', 400);

  for (const raw of plans) {
    const plan = (raw ?? {}) as Record<string, unknown>;
    const slug = typeof plan.slug === 'string' ? plan.slug : '';
    if (!slug) return fail('Every plan needs a slug', 400);

    const priceCents = whole(plan.priceCents, 0, 1_000_000);
    if (priceCents === null) return fail(`Price for ${slug} is not a number`, 400);

    const days = whole(plan.days, 1, 3650);
    if (days === null) return fail(`Days for ${slug} must be between 1 and 3650`, 400);

    const checkoutUrl =
      typeof plan.checkoutUrl === 'string' && plan.checkoutUrl.trim()
        ? safeUrl(plan.checkoutUrl)
        : null;
    if (typeof plan.checkoutUrl === 'string' && plan.checkoutUrl.trim() && !checkoutUrl) {
      return fail(`The checkout link for ${slug} must be a http or https URL`, 400);
    }

    await db.plan.update({
      where: { slug },
      data: {
        name: typeof plan.name === 'string' ? plan.name.slice(0, 60) : undefined,
        priceCents,
        days,
        checkoutUrl,
        blurb: typeof plan.blurb === 'string' ? plan.blurb.slice(0, 200) : undefined,
        visible: plan.visible === true,
      },
    });
  }

  return json({ ok: true });
}

/** A whole number within bounds, or null. Rejects NaN, floats and out-of-range. */
function whole(value: unknown, min: number, max: number): number | null {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) return null;
  return parsed;
}
