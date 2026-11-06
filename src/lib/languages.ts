/**
 * The languages offered in the extension's picker.
 *
 * A copy of `web/lib/languages.ts`, kept identical so the three builds agree on what is
 * offered. In this build the same table also names the tracks (`lib/subtitlecat/parse.ts`
 * runs in the offscreen document), so here it cannot drift from itself.
 *
 * Codes are subtitlecat's, which are Google-translate style rather than strict ISO 639-1.
 * Three of them are traps worth stating outright:
 *
 *   - Hebrew is `iw`, not `he`     (the pre-1989 ISO code, which Google kept)
 *   - Chinese is `zh-CN` / `zh-TW` (there is no plain `zh`)
 *   - Norwegian is `no`, Persian `fa`
 *
 * This list is deliberately a subset. The site carries ~150 languages, but nearly all of
 * them are machine translations of the same source track, and a 150-row picker is not a
 * feature. Anything outside this list still resolves — see `languageName`.
 */

export interface Language {
  /** subtitlecat's code, as it appears in the flag `alt` attribute and the `.srt` suffix. */
  code: string;
  /** English name, as shown in the picker. */
  name: string;
}

export const LANGUAGES: readonly Language[] = [
  { code: 'en', name: 'English' },
  { code: 'es', name: 'Spanish' },
  { code: 'zh-CN', name: 'Chinese (Simplified)' },
  { code: 'zh-TW', name: 'Chinese (Traditional)' },
  { code: 'hi', name: 'Hindi' },
  { code: 'ar', name: 'Arabic' },
  { code: 'fr', name: 'French' },
  { code: 'pt', name: 'Portuguese' },
  { code: 'ru', name: 'Russian' },
  { code: 'de', name: 'German' },
  { code: 'ja', name: 'Japanese' },
  { code: 'ko', name: 'Korean' },
  { code: 'tr', name: 'Turkish' },
  { code: 'it', name: 'Italian' },
  { code: 'id', name: 'Indonesian' },
  { code: 'vi', name: 'Vietnamese' },
  { code: 'th', name: 'Thai' },
  { code: 'pl', name: 'Polish' },
  { code: 'nl', name: 'Dutch' },
  { code: 'sv', name: 'Swedish' },
  { code: 'da', name: 'Danish' },
  { code: 'no', name: 'Norwegian' },
  { code: 'fi', name: 'Finnish' },
  { code: 'cs', name: 'Czech' },
  { code: 'el', name: 'Greek' },
  { code: 'iw', name: 'Hebrew' },
  { code: 'ro', name: 'Romanian' },
  { code: 'hu', name: 'Hungarian' },
  { code: 'uk', name: 'Ukrainian' },
  { code: 'bn', name: 'Bengali' },
  { code: 'fa', name: 'Persian' },
];

/** The language assumed when a user has never opened the picker. */
export const DEFAULT_LANGUAGE = 'en';

const BY_CODE = new Map(LANGUAGES.map((language) => [language.code, language]));

export function isKnownLanguage(code: string): boolean {
  return BY_CODE.has(code);
}

/**
 * Name for a code. Falls back to the label the site itself printed, so a language outside
 * our list still reads properly instead of showing a bare code.
 */
export function languageName(code: string, siteLabel?: string): string {
  return BY_CODE.get(code)?.name ?? siteLabel ?? code;
}
