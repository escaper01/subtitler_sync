import type { ToContent } from '@/types';
import { contextAlive, log } from '@/lib/log';
import { askBackground, onMessage, sendToBackground } from '@/lib/messaging';
import { hostOf, isAllowed, loadSites, onSitesChanged, topHostname } from '@/lib/sites';
import { VideoAgent } from '@/content/video-agent';
import { SubtitleOverlay } from '@/content/overlay';
import type { PanelHost } from '@/content/panel-host';

/**
 * Content script entry. Runs at document_start in EVERY frame, including the cross-origin
 * iframe that hosts the player.
 *
 * Two gates decide whether anything happens here:
 *
 *   1. Is the *tab's* site allowed? (see lib/sites.ts). If not, this frame stands down and
 *      does nothing but watch the allowlist, so enabling the site takes effect without a
 *      reload.
 *   2. Does this frame contain the film? Each frame looks independently, and the one that
 *      finds it renders the overlay and the panel — only a frame containing the video can
 *      draw on top of it, and only its DOM stays visible in fullscreen.
 */

if (!contextAlive()) {
  // Left over from a previous extension load; every chrome.* call would throw.
  console.debug('[subtitler] stale content script, standing down');
} else {
  void main();
}

async function main(): Promise<void> {
  const host = await resolveTopHost();
  let session: Session | null = null;

  const apply = (sites: string[]): void => {
    const allowed = isAllowed(host, sites);
    if (allowed && !session) {
      session = start();
      log.info('gate', `enabled on ${host}`);
    } else if (!allowed && session) {
      session.stop();
      session = null;
      log.info('gate', `disabled on ${host}`);
    }
  };

  // Registered once, not per session: chrome.runtime listeners cannot be added and removed
  // on every allowlist change without leaking one per toggle.
  onMessage<ToContent>((message) => {
    switch (message.kind) {
      case 'toggle-panel':
        // Every frame receives this; only the one hosting the panel acts on it.
        session?.togglePanel();
        return;
    }
  });

  // Subscribed before the first read, so a change that lands while we're reading is not
  // missed. `apply` only acts on a difference, so the order costs nothing.
  onSitesChanged(apply);
  apply(await loadSites());
}

/**
 * The host to check against the allowlist: the tab's top-level page, not this frame.
 *
 * `topHostname()` answers synchronously in almost every case. It only comes back null for
 * a frame with an opaque (sandboxed) ancestor, and then the service worker — which can see
 * the tab's URL — is the one context that knows.
 */
async function resolveTopHost(): Promise<string | null> {
  const local = topHostname();
  if (local) return local;

  const url = await askBackground<string | null>({ kind: 'get-top-url' });
  return hostOf(url);
}

/* ------------------------------------------------------------------- session */

interface Session {
  togglePanel: () => void;
  stop: () => void;
}

/**
 * Everything the extension does on a page it is allowed to run on. Built fresh each time
 * the site is enabled and torn down completely when it is disabled, so nothing survives to
 * draw on a page the user has just switched off.
 */
function start(): Session {
  const overlay = new SubtitleOverlay();

  /**
   * The panel is loaded on demand.
   *
   * It pulls in React, zustand and the compiled Tailwind CSS — roughly 270 KB that would
   * otherwise be parsed in every frame of the page, almost none of which ever contains a
   * film. It is imported only once one is found.
   */
  let panel: PanelHost | null = null;
  let panelLoading: Promise<void> | null = null;
  let stopped = false;

  function ensurePanel(video: HTMLVideoElement, container: HTMLElement): void {
    if (panel) {
      panel.mount(video, overlay, container);
      return;
    }
    if (panelLoading) return;

    panelLoading = import('@/content/panel-host')
      .then((module) => {
        // The site may have been switched off while the chunk was in flight.
        if (stopped) return;
        panel = new module.PanelHost();
        panel.mount(video, overlay, container);
      })
      .catch((err: unknown) => {
        log.error('panel', 'failed to load the panel', err);
      })
      .finally(() => {
        panelLoading = null;
      });
  }

  const agent = new VideoAgent({
    // Some <video> exists here, film or not. It's what lets the popup distinguish "nothing
    // on this page" from "something is here but detection passed it over".
    onFirstVideoSeen: () => sendToBackground({ kind: 'video-seen' }),

    onActiveChange: (video) => {
      if (!video) return;

      overlay.attach(video);

      const container = overlay.mountContainer;
      if (container) ensurePanel(video, container);

      sendToBackground({ kind: 'video-detected' });
    },
  });

  agent.start();

  log.debug('frame', `running in ${location.origin}`, {
    isTop: window.top === window,
    url: location.href.slice(0, 200),
  });

  return {
    togglePanel() {
      panel?.toggle();
    },

    stop() {
      stopped = true;
      agent.dispose();
      overlay.destroy();
      panel?.unmount();
      panel = null;
    },
  };
}
