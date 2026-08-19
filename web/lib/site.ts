/**
 * Site-wide constants.
 *
 * The store URL is a placeholder until the listing is published. It is here rather than
 * inline so the "Add to Chrome" buttons — header, hero, footer, how-to-use — cannot drift
 * apart when the real id arrives.
 */

export const STORE_URL =
  process.env.NEXT_PUBLIC_STORE_URL ?? 'https://chromewebstore.google.com/';

/**
 * This site's own origin, used to build absolute links the *extension* will open — it has
 * no relative path to resolve against, so these cannot be relative.
 */
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ??
  process.env.NEXTAUTH_URL ??
  'http://localhost:3000'
).replace(/\/+$/, '');
