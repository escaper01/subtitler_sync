/**
 * This installation's anonymous identity.
 *
 * All that is left of `auth.ts`. There is no licence key and no sign-in — the extension
 * carries no credential of any kind, because every feature is free.
 *
 * **The install id did not go with it, and its job changed.** It used to be what the
 * server counted devices by. It is now what the server's *rate limiter* counts against,
 * which is the only thing standing in front of the search API. A request without one is
 * not let through — it lands in a shared bucket with every other anonymous caller — so
 * sending it is in the user's interest, not ours.
 *
 * It lives in `chrome.storage.local`, **never `sync`**. Sync would push it to Google's
 * servers and onto every machine signed into the profile, which would make one id stand
 * for several browsers and share their rate limit between them.
 */

const INSTALL = 'installId';

/**
 * A stable, anonymous id for this installation.
 *
 * Random and local: it identifies a browser profile, never a person, and reinstalling
 * produces a new one. Created on first use rather than at install time, so a browser that
 * never searches never generates one at all.
 *
 * **It must not be regenerated.** A fresh id on every service-worker restart would look
 * like a new caller each time — which sounds like it evades the limiter and in fact means
 * the user's own history is scattered, and the shared anonymous bucket catches them anyway.
 */
export async function installId(): Promise<string> {
  try {
    const stored = await chrome.storage.local.get(INSTALL);
    const existing = stored[INSTALL];
    if (typeof existing === 'string' && existing.length > 0) return existing;

    const fresh = crypto.randomUUID();
    await chrome.storage.local.set({ [INSTALL]: fresh });
    return fresh;
  } catch {
    // Without storage there is no stable id to give. An empty one is honest: the server
    // puts an unidentified caller into the shared bucket rather than refusing them.
    return '';
  }
}
