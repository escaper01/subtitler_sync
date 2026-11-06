/**
 * Guessing a film title from the tab's `<title>`.
 *
 * Streaming sites wrap the title in their own branding — `Film (2019) online schauen |
 * hdfilme.to`, `Watch Film - kinoger`. Searching the whole string finds nothing, so the
 * box is seeded with a cleaned-up guess that the user can correct. Getting this slightly
 * wrong is cheap; the input is right there.
 *
 * Deliberately conservative: it only removes things that are unambiguously site chrome.
 */

/** Segments after one of these are the site's, not the film's. */
const SEPARATORS = ['|', '»', '«', '—', '–', '::', '*'];

/** Boilerplate verbs these sites put around a title, in the languages they use. */
const NOISE =
  /\b(watch|stream(ing)?|online|free|full\s*movie|hd|4k|1080p|720p|deutsch|german|kostenlos|anschauen|schauen|ansehen|ganzer\s*film|serie|staffel|vostfr|complet)\b/gi;

/** A trailing `- Something.tld` is a domain, not part of the title. */
const TRAILING_DOMAIN = /[-–—]\s*[\w-]+\.(to|com|net|org|win|best|cx|in|xyz|co|tv|me|io|de)\s*$/i;

export function guessSearchTitle(pageTitle: string | null | undefined): string {
  if (!pageTitle) return '';

  let value = pageTitle.trim();

  // Keep the longest segment rather than the first: some sites lead with their own name.
  for (const separator of SEPARATORS) {
    if (!value.includes(separator)) continue;
    value = value
      .split(separator)
      .map((part) => part.trim())
      .reduce((longest, part) => (part.length > longest.length ? part : longest), '');
  }

  value = value.replace(TRAILING_DOMAIN, '');
  value = value.replace(NOISE, ' ');

  // Bracketed asides are release noise far more often than part of a title.
  value = value.replace(/\((?:\s*\d{4}\s*)\)/g, ' ');
  value = value.replace(/\[[^\]]*\]/g, ' ');

  // Leftover punctuation from whatever was just removed.
  value = value.replace(/[·•|]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
  value = value.replace(/^[-–—:,.\s]+|[-–—:,.\s]+$/g, '');

  return value;
}
