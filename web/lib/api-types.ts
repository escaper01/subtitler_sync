/**
 * The contract between this API and the extension.
 *
 * The two live in separate folders with separate installs, so this file is duplicated at
 * `extension/src/lib/api-types.ts`. **Keep them identical.** Nothing enforces it — if you
 * change a shape here, change it there in the same commit.
 */

/** One upload on subtitlecat: a specific release someone posted subtitles for. */
export interface Release {
  /** Stable id derived from the detail-page path; safe to use as a React key. */
  id: string;
  /** Site-relative path of the detail page, e.g. `subs/45/Some.Release.html`. */
  path: string;
  /** The release name, which is usually the video filename it was timed against. */
  title: string;
  /** The language the uploader's original track was in, per "(translated from X)". */
  sourceLanguage: string | null;
  /** Download count of the whole upload. The site's only real quality signal. */
  downloads: number;
  /** How many language variants exist for it. */
  languageCount: number;
  /** Human-readable size of the original, e.g. "136 KB". */
  size: string | null;
  /** The site marks some uploads with a thumbs-up. */
  recommended: boolean;
}

/** One downloadable subtitle file: a release in a specific language. */
export interface Track {
  /** The owning release's id. */
  releaseId: string;
  /** subtitlecat's language code, e.g. `en`, `zh-CN`, `iw`. */
  code: string;
  /** Display name — our own where we know it, otherwise the site's label. */
  name: string;
  /** Site-relative path of the `.srt`. Pass back to `/api/download`. */
  path: string;
}

/** How many releases one page holds. Every release on a page arrives expanded. */
export const PAGE_SIZE = 5;

export interface SearchResponse {
  query: string;
  /** The language code the results were filtered to. */
  language: string;
  /** 1-based. */
  page: number;
  pageSize: number;
  /** Releases matching the query across all pages. */
  total: number;
  hasMore: boolean;
  /** This page's releases only. */
  releases: Release[];
  /**
   * Tracks for the releases on this page, already filtered to `language`. A release with
   * nothing in that language is still listed in `expanded` with no tracks here — the
   * client has to tell "empty" from "not fetched".
   */
  tracks: Track[];
  /** Ids of the releases `tracks` covers. */
  expanded: string[];
}

export interface ReleaseResponse {
  releaseId: string;
  title: string;
  tracks: Track[];
}

/**
 * Why a request was refused, in a form the client can branch on.
 *
 * The HTTP status is not enough: some corporate proxies mangle the less common ones, and a
 * client that wants to show a different message per reason should not be parsing prose.
 * Clients branch on this, never on the status.
 *
 * This list used to be twice as long. `not_signed_in`, `unknown_key`, `device_limit`,
 * `no_subscription`, `subscription_expired` and `account_disabled` went with the paywall —
 * there is no credential to be wrong about any more. An extension still sending the old
 * ones simply never receives them.
 */
export type ApiErrorCode =
  /** Too many searches, too fast. The only refusal a well-behaved client can now hit. */
  | 'rate_limited'
  | 'bad_request'
  | 'upstream'
  | 'server';

export interface ApiError {
  /** A sentence a user could act on. Always present. */
  error: string;
  /** Optional so an older extension simply ignores it. */
  code?: ApiErrorCode;
  /** Set when the caller can usefully retry, e.g. upstream rate limiting. */
  retryAfter?: number;
  /**
   * What the client should offer to do about it.
   *
   * Server-owned on purpose: where the button points can change without shipping an
   * extension update through Web Store review, which takes days.
   */
  action?: { label: string; url: string };
}

/* ------------------------------------------------------------------ donations */

/** One "support this" button, as configured at /admin/donations. */
export interface DonationLinkView {
  /** `paypal` | `kofi` | `buymeacoffee` | `patreon` | ... — picks an icon, nothing more. */
  provider: string;
  label: string;
  /** Validated `http`/`https` server-side. Never rendered as anything but an href. */
  url: string;
}

/**
 * What `GET /api/donate` answers.
 *
 * Replaces the old upgrade prompt, and is the only thing the extension now asks the server
 * for besides subtitles. Everyone sees the same answer — there are no subscribers to
 * exempt.
 *
 * Every string here is admin-supplied and is rendered by the extension **inside other
 * people's pages**. Render as text, never as markup, and use `color` only as an inline
 * style value — it is validated as `#rrggbb` server-side precisely so it can be.
 */
export interface DonatePrompt {
  enabled: boolean;
  heading: string;
  message: string;
  /** Validated `#rrggbb` server-side. Only ever used as an inline style value. */
  color: string;
  /** Already filtered to the visible ones, in the order the dashboard set. */
  links: DonationLinkView[];
}
