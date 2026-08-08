import type { LogEvent, NetEntry } from '@/types';
import { RingBuffer } from '@/lib/log';
import { looksLikeMedia } from '@/lib/url';

const NET_CAPACITY = 500;
const EVENT_CAPACITY = 500;
const SESSION_KEY = 'subtitler:diag';

export const netBuffer = new RingBuffer<NetEntry>(NET_CAPACITY);
export const eventBuffer = new RingBuffer<LogEvent>(EVENT_CAPACITY);

/** Index by chrome's requestId so onCompleted/onErrorOccurred can fill in the outcome. */
const inFlight = new Map<string, NetEntry>();

function record(entry: NetEntry): void {
  netBuffer.push(entry);
  inFlight.set(entry.id, entry);
  if (inFlight.size > NET_CAPACITY * 2) {
    // Requests that never completed (aborted, tab closed) would otherwise accumulate.
    const cutoff = Date.now() - 60_000;
    for (const [id, e] of inFlight) if (e.t < cutoff) inFlight.delete(id);
  }
  schedulePersist();
}

export function installNetworkLogging(): void {
  const filter: chrome.webRequest.RequestFilter = { urls: ['<all_urls>'] };

  // Observational only — no 'blocking' option. MV3 permits this; it cannot alter traffic.
  chrome.webRequest.onBeforeRequest.addListener((details) => {
    if (details.tabId < 0) return;
    record({
      id: details.requestId,
      t: details.timeStamp,
      method: details.method,
      type: details.type,
      url: details.url,
      frameId: details.frameId,
      tabId: details.tabId,
      media: looksLikeMedia(details.url, details.type),
    });
  }, filter);

  chrome.webRequest.onCompleted.addListener((details) => {
    const entry = inFlight.get(details.requestId);
    if (entry) {
      entry.status = details.statusCode;
      inFlight.delete(details.requestId);
      schedulePersist();
    }
  }, filter);

  chrome.webRequest.onErrorOccurred.addListener((details) => {
    const entry = inFlight.get(details.requestId);
    if (entry) {
      entry.error = details.error;
      inFlight.delete(details.requestId);
      schedulePersist();
    }
  }, filter);
}

/* ------------------------------------------------------------------ persistence */

/**
 * The service worker is suspended after ~30s idle, which would wipe both buffers and make
 * the debug log useless for anything but the last few seconds. Mirror them into
 * `storage.session` so the log survives SW restarts (but not a browser restart, which is
 * the right lifetime for diagnostics).
 */

let persistTimer: ReturnType<typeof setTimeout> | null = null;

export function schedulePersist(): void {
  if (persistTimer !== null) return;
  persistTimer = setTimeout(() => {
    persistTimer = null;
    void chrome.storage.session
      .set({ [SESSION_KEY]: { net: netBuffer.all(), events: eventBuffer.all() } })
      .catch(() => {
        /* quota or shutdown — diagnostics are best-effort */
      });
  }, 1500);
}

export async function restoreDiagnostics(): Promise<void> {
  try {
    const stored = await chrome.storage.session.get(SESSION_KEY);
    const blob = stored[SESSION_KEY] as { net?: NetEntry[]; events?: LogEvent[] } | undefined;
    if (!blob) return;

    // Merge rather than replace: listeners may already have recorded events while this
    // read was in flight. Sorting ascending means the ring keeps the newest entries.
    if (blob.net?.length) {
      const merged = dedupe([...blob.net, ...netBuffer.all()], (e) => e.id).sort((a, b) => a.t - b.t);
      netBuffer.clear();
      netBuffer.pushAll(merged);
    }
    if (blob.events?.length) {
      const merged = [...blob.events, ...eventBuffer.all()].sort((a, b) => a.t - b.t);
      eventBuffer.clear();
      eventBuffer.pushAll(merged);
    }
  } catch {
    /* ignore */
  }
}

function dedupe<T>(items: T[], keyOf: (item: T) => string): T[] {
  const seen = new Map<string, T>();
  for (const item of items) seen.set(keyOf(item), item);
  return [...seen.values()];
}

export function clearDiagnostics(): void {
  netBuffer.clear();
  eventBuffer.clear();
  inFlight.clear();
  void chrome.storage.session.remove(SESSION_KEY).catch(() => {});
}
