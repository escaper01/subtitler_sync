import { NextResponse } from 'next/server';

/**
 * JSON helpers for the **web app's own** routes — the ones authenticated by a session
 * cookie rather than a licence key.
 *
 * These deliberately do not set CORS headers, and that is the whole reason the module
 * exists. `lib/api.ts` sends `Access-Control-Allow-Origin: *` on every response, which is
 * safe there precisely because those endpoints carry no cookie: the credential is a header
 * the extension sets by hand, so no other origin can make a browser attach it.
 *
 * A cookie is different. It is attached automatically, and pairing an ambient credential
 * with a permissive CORS policy is how a hostile page ends up reading a signed-in user's
 * data. A wildcard origin without `Allow-Credentials` would in fact still be refused by
 * the browser — but reusing the CORS-emitting helper here would leave one `Allow-Credentials`
 * line between this app and that bug, which is too little standing between the two.
 *
 * Same-origin requests need no CORS headers at all, and these routes are same-origin only.
 *
 * CSRF is covered separately by NextAuth's `SameSite=Lax` session cookie, which is not sent
 * on cross-site POSTs.
 */

export function appJson(body: unknown, init?: ResponseInit): Response {
  return NextResponse.json(body, init);
}

export function appFail(message: string, status: number): Response {
  return appJson({ error: message }, { status });
}
