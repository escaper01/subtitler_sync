import { db } from '@/lib/db';
import type { DonatePrompt, DonationLinkView } from '@/lib/api-types';

/**
 * The donation prompt, as configured from the dashboard.
 *
 * This file is the surviving half of the old upgrade-prompt code, and it survived for one
 * reason: its validators. The heading, the message, the colour and every URL here are
 * **admin-supplied and end up rendered inside other people's pages** by the extension
 * panel. So all of them are validated on the way in and rendered as text on the way out —
 * never as markup. Shadow DOM contains a CSS injection; it does not prevent one.
 *
 * Nothing here decides *who* sees the prompt. There are no accounts and no subscribers to
 * exempt: everyone sees it, which is why the old `entitled` parameter is gone rather than
 * defaulted.
 */

const HEX = /^#[0-9a-fA-F]{6}$/;
const MAX_MESSAGE = 240;
const MAX_HEADING = 60;
const MAX_LABEL = 40;

/** Accept only `#rrggbb`. Anything else falls back rather than reaching a style attribute. */
export function safeColor(raw: string | null | undefined, fallback = '#38bdf8'): string {
  return raw && HEX.test(raw) ? raw : fallback;
}

export function safeMessage(raw: string | null | undefined): string {
  return (raw ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_MESSAGE);
}

export function safeHeading(raw: string | null | undefined): string {
  return (raw ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_HEADING);
}

export function safeLabel(raw: string | null | undefined): string {
  return (raw ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_LABEL);
}

/**
 * A URL we are willing to send someone to.
 *
 * `http`/`https` only. A `javascript:` href in an admin-controlled field would be script
 * execution in every page the extension touches, and a `data:` one is a phishing page
 * served from our own button — neither is a theoretical concern when the field is edited
 * through a web form.
 */
export function safeUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw.trim());
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null;
  } catch {
    return null;
  }
}

/** The providers the UI knows an icon for. Anything else renders with a generic one. */
export const KNOWN_PROVIDERS = [
  'paypal',
  'kofi',
  'buymeacoffee',
  'patreon',
  'github',
  'liberapay',
  'custom',
] as const;

export type KnownProvider = (typeof KNOWN_PROVIDERS)[number];

export function safeProvider(raw: string | null | undefined): string {
  const value = (raw ?? '').trim().toLowerCase().slice(0, 24);
  return value || 'custom';
}

export const NO_PROMPT: DonatePrompt = {
  enabled: false,
  heading: '',
  message: '',
  color: '#38bdf8',
  links: [],
};

/**
 * What to show everyone.
 *
 * A link whose URL fails validation is **dropped**, not rendered dead: a button that goes
 * nowhere is worse than one that is not there, and the admin form rejects the same values
 * on the way in, so reaching this branch means the row predates the validation.
 *
 * Never throws. A missing database means no prompt, not a failed page — this is called
 * from the site's root layout and from an endpoint the extension polls.
 */
export async function donatePrompt(): Promise<DonatePrompt> {
  try {
    const [setting, rows] = await Promise.all([
      db.siteSetting.findUnique({ where: { id: 'singleton' } }),
      db.donationLink.findMany({
        where: { visible: true },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      }),
    ]);

    if (!setting?.donateEnabled) return NO_PROMPT;

    const links: DonationLinkView[] = [];
    for (const row of rows) {
      const url = safeUrl(row.url);
      if (!url) continue;
      links.push({ provider: safeProvider(row.provider), label: safeLabel(row.label), url });
    }

    return {
      enabled: true,
      heading: safeHeading(setting.donateHeading),
      message: safeMessage(setting.donateMessage),
      color: safeColor(setting.donateColor),
      links,
    };
  } catch {
    // A donation prompt is never worth failing a request over.
    return NO_PROMPT;
  }
}
