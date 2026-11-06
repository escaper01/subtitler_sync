import type { FromOffscreen, ToOffscreen } from '@/types';
import { parseDetail, parseSearch } from '@/lib/subtitlecat/parse';

/**
 * The offscreen document: a DOM for the worker to parse HTML with.
 *
 * A service worker has no `DOMParser`, and the only other contexts that do are the popup
 * (open for seconds at a time) and the content script (inside somebody else's page). MV3's
 * answer is this — an invisible extension page, created by the worker when a search needs
 * parsing and closed shortly after, whose whole job is to turn HTML into JSON.
 *
 * `DOMParser` produces an inert document: no script runs, no image loads, no stylesheet
 * applies. Subtitlecat's markup is untrusted and this is where it is handled.
 *
 * Every message that reaches a runtime listener reaches this one too, so anything not
 * addressed here is ignored by returning `false` — which leaves the channel to the worker.
 */

const parser = new DOMParser();

function handle(message: ToOffscreen): FromOffscreen<unknown> {
  const doc = parser.parseFromString(message.html, 'text/html');

  switch (message.kind) {
    case 'parse:search':
      return { ok: true, data: parseSearch(doc, message.selectors) };
    case 'parse:detail':
      return { ok: true, data: parseDetail(doc, message.id, message.selectors) };
  }
}

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
  const candidate = message as Partial<ToOffscreen> | null;
  if (candidate?.target !== 'offscreen') return false;

  try {
    sendResponse(handle(candidate as ToOffscreen));
  } catch (err) {
    // A selector from the remote config that does not parse lands here. The worker
    // retries with the bundled selectors on this answer.
    sendResponse({ ok: false, error: err instanceof Error ? err.message : String(err) });
  }
  return false;
});
