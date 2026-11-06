/**
 * The shapes the Find tab consumes.
 *
 * In `extension/` this file is a copy of `web/lib/api-types.ts` — the contract between the
 * extension and the search API. **This build has no API.** The worker talks to subtitlecat
 * itself and produces these same shapes, so the panel, the store and the components did
 * not have to change. What is gone is everything that only made sense with a server
 * between the two: the error envelope's `action` button, and the `server` error code.
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
  /** Site-relative path of the `.srt`. Pass back to `downloadSubtitle`. */
  path: string;
}

/** How many releases one page holds. Every release on a page arrives expanded. */
export const PAGE_SIZE = 5;

export interface SearchResponse {
  query: string;
  /**
   * The language codes the results were filtered to, in the order they were asked for.
   *
   * One or two. Asking for two costs exactly what one does — a release page is fetched
   * once and already carries every language — so a client showing two subtitle tracks
   * should request both here rather than making a second call per release.
   */
  languages: string[];
  /** 1-based. */
  page: number;
  pageSize: number;
  /** Releases matching the query across all pages. */
  total: number;
  hasMore: boolean;
  /** This page's releases only. */
  releases: Release[];
  /**
   * Tracks for the releases on this page, already filtered to `languages` and ordered by
   * it — a release's track in the first language comes before its track in the second.
   *
   * A release with nothing in any requested language is still listed in `expanded` with no
   * tracks here: the client has to tell "empty" from "not fetched". Group by
   * `track.releaseId`, and within a release tell them apart by `track.code`.
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
 * Why a request was refused, in a form the panel can branch on.
 *
 * Three, not four: `server` meant *our* server, and there is none. `rate_limited` now
 * means subtitlecat itself answered 429 — the panel renders it amber for the same reason
 * it always did, because waiting is not the same as broken.
 */
export type ApiErrorCode = 'rate_limited' | 'bad_request' | 'upstream';

/* ------------------------------------------------------------------ donations */

/** One "support this" button. */
export interface DonationLinkView {
  /** `paypal` | `kofi` | `buymeacoffee` | `patreon` | ... — picks an icon, nothing more. */
  provider: string;
  label: string;
  /** Validated `http`/`https` before it gets here. Never rendered as anything but an href. */
  url: string;
}

/**
 * The donation prompt.
 *
 * Comes from the remote config file rather than a dashboard — see `lib/subtitlecat/config.ts`.
 * Every string here is rendered by the extension **inside other people's pages**. Render
 * as text, never as markup, and use `color` only as an inline style value — it is
 * validated as `#rrggbb` on the way in precisely so it can be.
 */
export interface DonatePrompt {
  enabled: boolean;
  heading: string;
  message: string;
  /** Validated `#rrggbb`. Only ever used as an inline style value. */
  color: string;
  /** Already filtered to the usable ones, in the order the config lists them. */
  links: DonationLinkView[];
}
