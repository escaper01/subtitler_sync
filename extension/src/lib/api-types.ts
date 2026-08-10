/**
 * The contract between this API and the extension.
 *
 * The two live in separate folders with separate installs, so this file is a copy of
 * `web/lib/api-types.ts`. **Keep them identical.** Nothing enforces it — if you change a
 * shape there, change it here in the same commit.
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
 * The HTTP status is not enough: "sign in", "subscribe" and "your subscription lapsed" all
 * need different buttons, and some corporate proxies mangle a 402 anyway. Clients branch
 * on this, never on the status.
 */
export type ApiErrorCode =
  | 'not_signed_in'
  | 'token_expired'
  | 'no_subscription'
  | 'subscription_expired'
  | 'account_disabled'
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
   * Server-owned on purpose: where "Subscribe" points can change without shipping an
   * extension update through Web Store review, which takes days.
   */
  action?: { label: string; url: string };
}

/** What `/api/me` answers. Lets the panel label its button before a request fails. */
export interface MeResponse {
  signedIn: boolean;
  email: string | null;
  entitled: boolean;
  /** ISO date, or null when there has never been a subscription. */
  entitledUntil: string | null;
  source: string | null;
}
