import type { FromOffscreen, ToOffscreen } from '@/types';
import { parseDetail, parseSearch } from '@/lib/subtitlecat/parse';

/**
 * Driving the offscreen document from the worker.
 *
 * Chrome allows one offscreen document per extension, so creation is serialised here and
 * "already exists" is not an error. It is closed a little after the last parse rather than
 * straight after each one: a search is one search-page parse, a pause while five detail
 * pages download, and five detail parses — closing in that pause would mean paying for
 * the document twice per search. If the worker is suspended before the timer fires the
 * document simply lingers until the next search finds it, which costs nothing.
 */

const DOCUMENT_URL = 'src/offscreen/offscreen.html';
const CLOSE_AFTER_MS = 30_000;

let creating: Promise<void> | null = null;
let closeTimer: ReturnType<typeof setTimeout> | null = null;

async function exists(): Promise<boolean> {
  const contexts = await chrome.runtime.getContexts({
    contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
  });
  return contexts.length > 0;
}

async function ensure(): Promise<void> {
  if (await exists()) return;

  creating ??= chrome.offscreen
    .createDocument({
      url: DOCUMENT_URL,
      reasons: [chrome.offscreen.Reason.DOM_PARSER],
      justification: 'Parse subtitle listings fetched from subtitlecat.',
    })
    .catch((err: unknown) => {
      // Two searches racing past the `exists()` check above: the second creation fails
      // because the first one won, which is the outcome we wanted.
      if (!String(err).toLowerCase().includes('single offscreen')) throw err;
    })
    .finally(() => {
      creating = null;
    });

  await creating;
}

function scheduleClose(): void {
  if (closeTimer !== null) clearTimeout(closeTimer);
  closeTimer = setTimeout(() => {
    closeTimer = null;
    void chrome.offscreen.closeDocument().catch(() => {});
  }, CLOSE_AFTER_MS);
}

/**
 * Firefox has no service worker and no offscreen API: its background is an event page,
 * which *has* a `DOMParser`, so the parse happens right here. Detected by the capability
 * rather than by build flag — the question being asked is "is there a DOM?".
 */
function parseInline<T>(message: ToOffscreen): T {
  const doc = new DOMParser().parseFromString(message.html, 'text/html');
  switch (message.kind) {
    case 'parse:search':
      return parseSearch(doc, message.selectors) as T;
    case 'parse:detail':
      return parseDetail(doc, message.id, message.selectors) as T;
  }
}

/** Hand HTML to the offscreen document and get JSON back. Throws on any failure. */
export async function parseOffscreen<T>(message: ToOffscreen): Promise<T> {
  // A selector that does not parse throws here, as it would have in the offscreen
  // document; the caller in lib/api.ts retries with the bundled selectors either way.
  if (typeof DOMParser !== 'undefined') return parseInline<T>(message);

  await ensure();
  scheduleClose();

  const reply = (await chrome.runtime.sendMessage(message)) as FromOffscreen<T> | undefined;
  if (!reply) throw new Error('The parser did not answer.');
  if (!reply.ok) throw new Error(reply.error);
  return reply.data;
}
