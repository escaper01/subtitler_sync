import { NextResponse } from 'next/server';
import type { ApiError } from '@/lib/api-types';
import { UpstreamError } from '@/lib/subtitlecat/http';

/**
 * Shared plumbing for the `/api/*` routes the extension calls.
 *
 * CORS is wide open on purpose: these are public read-only endpoints and the caller is a
 * `chrome-extension://` origin, which is opaque and cannot be allowlisted usefully. There
 * are no cookies involved — when licence keys arrive they travel in a header, so
 * credentials stay off and `*` remains safe.
 */

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Subtitler-Key, X-Subtitler-Install',
  'Access-Control-Max-Age': '86400',
};

export function withCors<T extends Response>(response: T): T {
  for (const [name, value] of Object.entries(CORS_HEADERS)) {
    response.headers.set(name, value);
  }
  return response;
}

export function preflight(): Response {
  return withCors(new Response(null, { status: 204 }));
}

export function json(body: unknown, init?: ResponseInit): Response {
  return withCors(NextResponse.json(body, init));
}

export function fail(message: string, status: number, retryAfter?: number): Response {
  const body: ApiError = retryAfter === undefined ? { error: message } : { error: message, retryAfter };
  return json(body, { status });
}

/**
 * Turn a thrown error into a response.
 *
 * `UpstreamError` carries a status chosen where the failure happened, so the extension can
 * tell "subtitlecat is down" from "you asked for something impossible". Anything else is
 * ours and is reported as a 500 without leaking the message.
 */
export function fromError(err: unknown): Response {
  if (err instanceof UpstreamError) {
    return fail(err.message, err.status, err.status === 429 ? 60 : undefined);
  }
  console.error('[api] unhandled', err);
  return fail('Something went wrong on our side', 500);
}

const MAX_QUERY_LENGTH = 120;

/** Validate a search term. Returns null when it could not be a real title. */
export function parseQuery(raw: string | null): string | null {
  const value = raw?.trim() ?? '';
  if (value.length === 0 || value.length > MAX_QUERY_LENGTH) return null;
  return value;
}

const LANGUAGE_CODE = /^[a-z]{2,3}(-[A-Za-z]{2,4})?$/i;
const MAX_LANGUAGES = 40;

/**
 * Parse `?langs=en,fr,zh-CN`.
 *
 * Unrecognised entries are dropped rather than rejected: the picker and this API can be
 * different versions, and a code we don't know is a filter that matches nothing, not a
 * bad request.
 */
export function parseLanguages(raw: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((code) => code.trim())
    .filter((code) => code.length > 0 && LANGUAGE_CODE.test(code))
    .slice(0, MAX_LANGUAGES);
}

/** Validate a site-relative path from the client before it reaches the fetcher. */
export function parsePath(raw: string | null): string | null {
  const value = raw?.trim() ?? '';
  if (value.length === 0 || value.length > 512) return null;
  return value;
}
