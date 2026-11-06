import type { DonatePrompt, DonationLinkView } from '@/lib/api-types';

/**
 * Validating the donation prompt.
 *
 * The pure half of `web/lib/donate.ts`, and the half that mattered: the heading, the
 * message, the colour and every URL end up rendered by the panel **inside other people's
 * pages**. In `extension/` a server validated them before they were sent; here they
 * arrive from a JSON file on GitHub, so the same checks run on this side instead. Shadow
 * DOM contains a CSS injection; it does not prevent one.
 */

const HEX = /^#[0-9a-fA-F]{6}$/;
const MAX_MESSAGE = 240;
const MAX_HEADING = 60;
const MAX_LABEL = 40;
const MAX_LINKS = 6;

/** Accept only `#rrggbb`. Anything else falls back rather than reaching a style attribute. */
export function safeColor(raw: unknown, fallback = '#38bdf8'): string {
  return typeof raw === 'string' && HEX.test(raw) ? raw : fallback;
}

function safeText(raw: unknown, max: number): string {
  return typeof raw === 'string' ? raw.replace(/\s+/g, ' ').trim().slice(0, max) : '';
}

/**
 * A URL we are willing to send someone to.
 *
 * `http`/`https` only. A `javascript:` href in the config would be script execution in
 * every page the extension touches, and a `data:` one is a phishing page served from our
 * own button.
 */
export function safeUrl(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.length === 0) return null;
  try {
    const url = new URL(raw.trim());
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null;
  } catch {
    return null;
  }
}

export function safeProvider(raw: unknown): string {
  const value = typeof raw === 'string' ? raw.trim().toLowerCase().slice(0, 24) : '';
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
 * Turn whatever the config carried into a prompt the panel may render.
 *
 * A link whose URL fails validation is **dropped**, not rendered dead: a button that goes
 * nowhere is worse than one that is not there. Never throws — a malformed prompt means no
 * prompt, not a broken panel.
 */
export function readDonate(raw: unknown): DonatePrompt {
  if (!raw || typeof raw !== 'object') return NO_PROMPT;
  const value = raw as Record<string, unknown>;
  if (value.enabled !== true) return NO_PROMPT;

  const links: DonationLinkView[] = [];
  for (const entry of Array.isArray(value.links) ? value.links : []) {
    if (!entry || typeof entry !== 'object') continue;
    const link = entry as Record<string, unknown>;
    const url = safeUrl(link.url);
    if (!url) continue;
    links.push({ provider: safeProvider(link.provider), label: safeText(link.label, MAX_LABEL), url });
    if (links.length >= MAX_LINKS) break;
  }

  return {
    enabled: true,
    heading: safeText(value.heading, MAX_HEADING),
    message: safeText(value.message, MAX_MESSAGE),
    color: safeColor(value.color),
    links,
  };
}
