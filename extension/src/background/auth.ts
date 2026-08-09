import { log } from '@/lib/log';

/**
 * The extension's half of the sign-in handoff.
 *
 * Our own website mints a token and passes it here with
 * `chrome.runtime.sendMessage(<extension id>, …)`, which only works because the manifest
 * lists that origin under `externally_connectable`. Anything from anywhere else never
 * reaches this code at all.
 *
 * The token lives in `chrome.storage.local`, **never `sync`** — sync would push a bearer
 * credential to Google's servers and onto every machine signed into the profile. That is a
 * different reason from the local/sync split described in lib/storage.ts, so it is worth
 * stating separately.
 */

const AUTH_KEY = 'auth';

export interface AuthState {
  token: string;
  /** ISO date. Advisory only — the server decides; this just avoids pointless requests. */
  expiresAt: string;
}

/** Message shape the website sends. Nothing else is accepted. */
interface TokenMessage {
  kind: 'subtitler:token';
  token: string;
  expiresAt: string;
}

function looksLikeTokenMessage(value: unknown): value is TokenMessage {
  if (typeof value !== 'object' || value === null) return false;
  const message = value as Record<string, unknown>;
  return (
    message.kind === 'subtitler:token' &&
    typeof message.token === 'string' &&
    message.token.startsWith('stx_') &&
    typeof message.expiresAt === 'string'
  );
}

export async function loadAuth(): Promise<AuthState | null> {
  try {
    const stored = await chrome.storage.local.get(AUTH_KEY);
    const value = stored[AUTH_KEY] as Partial<AuthState> | undefined;
    if (!value || typeof value.token !== 'string') return null;
    return { token: value.token, expiresAt: value.expiresAt ?? '' };
  } catch {
    return null;
  }
}

export async function saveAuth(state: AuthState): Promise<void> {
  try {
    await chrome.storage.local.set({ [AUTH_KEY]: state });
  } catch {
    /* storage full or unavailable — the user can sign in again */
  }
}

export async function clearAuth(): Promise<void> {
  try {
    await chrome.storage.local.remove(AUTH_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Listen for the website handing over a token.
 *
 * **Must be called at the top level of the service worker**, synchronously during script
 * evaluation. MV3 only wakes a suspended worker for listeners registered that way; one
 * registered inside an async callback simply never fires, and the handoff appears to hang
 * with nothing in any log.
 */
export function listenForToken(): void {
  chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
    // `externally_connectable` already filtered by origin. Checking again is cheap, and
    // means this stays correct if that list is ever widened.
    const origin = sender.origin ?? (sender.url ? safeOrigin(sender.url) : null);
    if (!origin) {
      sendResponse({ ok: false });
      return false;
    }

    if (!looksLikeTokenMessage(message)) {
      sendResponse({ ok: false });
      return false;
    }

    void saveAuth({ token: message.token, expiresAt: message.expiresAt }).then(() => {
      log.info('auth', `signed in via ${origin}`);
      sendResponse({ ok: true });
    });

    // Keeps the channel open for the async response above.
    return true;
  });
}

function safeOrigin(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}
