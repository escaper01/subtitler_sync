/**
 * Site-wide constants.
 *
 * The store URL is a placeholder until the listing is published. It is here rather than
 * inline so the "Add to Chrome" buttons — header, hero, footer, how-to-use — cannot drift
 * apart when the real id arrives.
 */

export const STORE_URL =
  process.env.NEXT_PUBLIC_STORE_URL ?? 'https://chromewebstore.google.com/';

export const DONATE_URL = process.env.NEXT_PUBLIC_DONATE_URL ?? '';
