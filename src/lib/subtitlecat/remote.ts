import { DEFAULT_CONFIG, readConfig, type RemoteConfig } from '@/lib/subtitlecat/config';

/**
 * Fetching the remote config. **Service worker only.**
 *
 * One JSON file, read straight off GitHub. It is authored as `remote/config.json` in this
 * folder and published to a separate **public** repository by `npm run config:publish` —
 * separate because this repository is private, and raw.githubusercontent.com answers 404
 * for a private file. Editing it and publishing is how a renamed selector or a new
 * donation link reaches every install without a build — the whole reason this build can
 * do without a server.
 *
 * Cached in `storage.local`, not in worker memory (which is suspended after ~30s idle
 * and would refetch constantly). A fresh copy is used as is; a stale one is used at once
 * and refreshed in the background, so a slow GitHub never sits in front of a search; no
 * copy at all means one awaited fetch, and the bundled defaults if that fails.
 */

export const CONFIG_URL = 'https://raw.githubusercontent.com/escaper01/subtitler-config/main/config.json';

const KEY = 'sc:config';
const TTL_MS = 6 * 60 * 60 * 1000;
const TIMEOUT_MS = 8_000;
/** The file is a few hundred bytes. Anything larger is not it. */
const MAX_BYTES = 64 * 1024;

interface Cached {
  at: number;
  data: RemoteConfig;
}

async function readCached(): Promise<Cached | null> {
  try {
    const stored = await chrome.storage.local.get(KEY);
    const value = stored[KEY] as Cached | undefined;
    if (!value || typeof value.at !== 'number') return null;
    // Re-validated on the way out: a copy written by an older build may not be this shape.
    return { at: value.at, data: readConfig(value.data) };
  } catch {
    return null;
  }
}

async function fetchRemote(): Promise<RemoteConfig | null> {
  try {
    const response = await fetch(CONFIG_URL, {
      cache: 'no-cache',
      credentials: 'omit',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) return null;

    const text = await response.text();
    if (text.length > MAX_BYTES) return null;

    // Validated field by field: whatever the file got wrong falls back to the bundled
    // value rather than reaching the parser or the panel.
    return readConfig(JSON.parse(text));
  } catch {
    return null;
  }
}

let refreshing: Promise<RemoteConfig | null> | null = null;

/** One fetch at a time, however many searches ask during it. */
function refresh(): Promise<RemoteConfig | null> {
  refreshing ??= fetchRemote()
    .then(async (config) => {
      if (config) {
        try {
          await chrome.storage.local.set({ [KEY]: { at: Date.now(), data: config } satisfies Cached });
        } catch {
          /* a cache miss is not worth an error */
        }
      }
      return config;
    })
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

/** The config to use right now. Never throws, never returns nothing. */
export async function loadConfig(): Promise<RemoteConfig> {
  const cached = await readCached();

  if (cached && Date.now() - cached.at < TTL_MS) return cached.data;

  if (cached) {
    void refresh();
    return cached.data;
  }

  return (await refresh()) ?? DEFAULT_CONFIG;
}
