import type { ToBackground, ToBackgroundFromPopup, ToContent } from '@/types';
import { contextAlive } from '@/lib/log';

/**
 * Typed wrappers over chrome messaging.
 *
 * Everything here swallows the "receiving end does not exist" / "context invalidated"
 * class of errors. Those are normal — frames navigate away, the extension gets reloaded —
 * and letting them reject unhandled just fills the console with noise during development.
 */

function isExpectedDisconnect(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? '');
  return (
    msg.includes('Extension context invalidated') ||
    msg.includes('Receiving end does not exist') ||
    msg.includes('message port closed') ||
    msg.includes('No tab with id') ||
    msg.includes('No frame with id')
  );
}

/** Fire-and-forget message to the service worker. Safe to call from a dead context. */
export function sendToBackground(message: ToBackground): void {
  if (!contextAlive()) return;
  try {
    void chrome.runtime.sendMessage(message).catch((err: unknown) => {
      if (!isExpectedDisconnect(err)) console.error('[subtitler] sendToBackground', err);
    });
  } catch (err) {
    if (!isExpectedDisconnect(err)) console.error('[subtitler] sendToBackground', err);
  }
}

/** Request/response against the service worker. Resolves to null if it could not be reached. */
export async function askBackground<T>(
  message: ToBackground | ToBackgroundFromPopup,
): Promise<T | null> {
  if (!contextAlive()) return null;
  try {
    return (await chrome.runtime.sendMessage(message)) as T;
  } catch (err) {
    if (!isExpectedDisconnect(err)) console.error('[subtitler] askBackground', err);
    return null;
  }
}

/** Send to every frame of a tab that has our content script. */
export async function broadcastToTab(tabId: number, message: ToContent): Promise<void> {
  try {
    await chrome.tabs.sendMessage(tabId, message);
  } catch (err) {
    if (!isExpectedDisconnect(err)) console.error('[subtitler] broadcastToTab', err);
  }
}

type Responder = (response?: unknown) => void;

/**
 * Register a message listener.
 *
 * Returning a promise from `handler` keeps the message channel open for the reply, which
 * is the part of the chrome messaging API that is easy to get wrong: the raw listener must
 * return literal `true` to signal an async response.
 */
export function onMessage<M>(
  handler: (message: M, sender: chrome.runtime.MessageSender) => unknown,
): void {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse: Responder) => {
    let result: unknown;
    try {
      result = handler(message as M, sender);
    } catch (err) {
      console.error('[subtitler] message handler threw', err);
      return false;
    }

    if (result instanceof Promise) {
      result.then(
        (value) => sendResponse(value),
        (err) => {
          if (!isExpectedDisconnect(err)) console.error('[subtitler] async handler', err);
          sendResponse(undefined);
        },
      );
      return true;
    }

    if (result !== undefined) {
      sendResponse(result);
    }
    return false;
  });
}
