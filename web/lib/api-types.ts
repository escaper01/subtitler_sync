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

export interface ApiError {
  error: string;
  /** Set when the caller can usefully retry, e.g. upstream rate limiting. */
  retryAfter?: number;
}
