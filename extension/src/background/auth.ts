import { log } from '@/lib/log';

/**
 * The licence key, and this installation's identity.
 *
 * There is no sign-in. The customer buys a key, Lemon Squeezy emails it to them, they paste
 * it into the popup, and it travels as `X-Subtitler-Key` on every request. That is the
 * whole of authentication here.
 *
 * Both values live in `chrome.storage.local`, **never `sync`**: the key is a bearer
 * credential and sync would push it to Google's servers and onto every machine signed into
 * the profile — which would also quietly consume the device limit.
 */

const KEY = 'licenseKey';
const INSTALL = 'installId';

export async function loadKey(): Promise<string | null> {
  try {
    const stored = await chrome.storage.local.get(KEY);
    const value = stored[KEY];
    return typeof value === 'string' && value.length > 0 ? value : null;
  } catch {
    return null;
  }
}

export async function saveKey(key: string): Promise<void> {
  try {
    await chrome.storage.local.set({ [KEY]: key.trim() });
    log.info('auth', 'licence key stored');
  } catch {
    /* storage unavailable — the user can paste it again */
  }
}

export async function clearKey(): Promise<void> {
  try {
    await chrome.storage.local.remove(KEY);
  } catch {
    /* ignore */
  }
}

/**
 * A stable, anonymous id for this installation.
 *
 * It is what "device" means to the licence limit, and the only thing tying repeat searches
 * together in the logs. Random and local: it identifies a browser profile, never a person,
 * and reinstalling produces a new one.
 *
 * Created on first use rather than at install time, so a browser that never uses search
 * never generates one at all.
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
    // treats a missing install as "cannot count devices" rather than as a new device each
    // time, which would exhaust the limit within minutes.
    return '';
  }
}
