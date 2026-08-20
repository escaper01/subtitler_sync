/**
 * The contract between this build and the API — all that is left of it.
 *
 * The full build's copy carries `Release`, `Track`, `SearchResponse` and `ReleaseResponse`
 * for subtitle search. There is no search here, so this build asks the server exactly one
 * question — "is there a donation prompt?" — and these are the only shapes involved.
 *
 * The donate shapes below are **duplicated** from `web/lib/api-types.ts` and
 * `extension/src/lib/api-types.ts`. **Keep all three identical.** Nothing enforces it: if
 * you change a shape in `web`, change it in both extensions in the same commit.
 */

/**
 * Why a request was refused, in a form the client can branch on.
 *
 * Only `server` and `upstream` are reachable from this build — `/api/donate` takes no
 * parameters and is never rate limited — but the union is kept whole so the type matches
 * the other two copies.
 */
export type ApiErrorCode = 'rate_limited' | 'bad_request' | 'upstream' | 'server';

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
 * **The only request this build ever makes.** Everything else it does — loading a subtitle
 * file, syncing it, styling it, the site allowlist — happens entirely in the browser and
 * touches no server at all.
 *
 * Every string here is admin-supplied and is rendered **inside other people's pages**.
 * Render as text, never as markup, and use `color` only as an inline style value — it is
 * validated as `#rrggbb` server-side precisely so it can be.
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
