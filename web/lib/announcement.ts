import { db } from '@/lib/db';

/**
 * The upgrade prompt, as configured from the dashboard.
 *
 * Its text and colour are admin-supplied and end up rendered inside *other people's pages*
 * by the extension. So both are validated on the way in and rendered as text on the way
 * out — never as markup. Shadow DOM contains a CSS injection; it does not prevent one.
 */

export interface Announcement {
  enabled: boolean;
  message: string;
  color: string;
  url: string | null;
}

const HEX = /^#[0-9a-fA-F]{6}$/;
const MAX_MESSAGE = 240;

/** Accept only `#rrggbb`. Anything else falls back rather than reaching a style attribute. */
export function safeColor(raw: string | null | undefined, fallback = '#38bdf8'): string {
  return raw && HEX.test(raw) ? raw : fallback;
}

export function safeMessage(raw: string | null | undefined): string {
  return (raw ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_MESSAGE);
}

/**
 * A URL we are willing to send someone to.
 *
 * `http`/`https` only: a `javascript:` href in an admin-controlled field would be script
 * execution in every page the extension touches.
 */
export function safeUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null;
  } catch {
    return null;
  }
}

export const NO_ANNOUNCEMENT: Announcement = {
  enabled: false,
  message: '',
  color: '#38bdf8',
  url: null,
};

/**
 * What to show a given caller.
 *
 * `entitled` is decided server-side from their token, never asked for by the client — so a
 * signed-out caller cannot request the subscriber-only variant, and a subscriber is not
 * asked for money they have already paid.
 */
export async function announcementFor(entitled: boolean): Promise<Announcement> {
  if (entitled) return NO_ANNOUNCEMENT;

  try {
    const setting = await db.siteSetting.findUnique({ where: { id: 'singleton' } });
    if (!setting?.promptEnabled) return NO_ANNOUNCEMENT;

    return {
      enabled: true,
      message: safeMessage(setting.promptMessage),
      color: safeColor(setting.promptColor),
      url: safeUrl(setting.promptUrl),
    };
  } catch {
    // A banner is never worth failing a request over.
    return NO_ANNOUNCEMENT;
  }
}
