import type { ToContent } from '@/types';
import { contextAlive, log } from '@/lib/log';
import { onMessage, sendToBackground } from '@/lib/messaging';
import { VideoAgent } from '@/content/video-agent';
import { SubtitleOverlay } from '@/content/overlay';
import type { PanelHost } from '@/content/panel-host';

/**
 * Content script entry. Runs at document_start in EVERY frame, including the cross-origin
 * iframe that hosts the player.
 *
 * Each frame independently looks for the film. The frame that finds it is the one that
 * renders the overlay and the panel, because only a frame containing the video can draw on
 * top of it — and only that frame's DOM stays visible in fullscreen.
 */

if (!contextAlive()) {
  // Left over from a previous extension load; every chrome.* call would throw.
  console.debug('[subtitler] stale content script, standing down');
} else {
  main();
}

function main(): void {
  const overlay = new SubtitleOverlay();

  /**
   * The panel is loaded on demand.
   *
   * This script runs in every frame of every page, and the panel pulls in React, zustand
   * and the compiled Tailwind CSS — roughly 270 KB that would otherwise be parsed inside
   * every ad iframe on the web. Almost no frame ever contains a film, so the panel is
   * imported only once one is found.
   */
  let panel: PanelHost | null = null;
  let panelLoading: Promise<void> | null = null;

  function ensurePanel(video: HTMLVideoElement, container: HTMLElement): void {
    if (panel) {
      panel.mount(video, overlay, container);
      return;
    }
    if (panelLoading) return;

    panelLoading = import('@/content/panel-host')
      .then((module) => {
        panel = new module.PanelHost();
        panel.mount(video, overlay, container);
        sendReport();
      })
      .catch((err: unknown) => {
        log.error('panel', 'failed to load the panel', err);
      })
      .finally(() => {
        panelLoading = null;
      });
  }

  const agent = new VideoAgent({
    // Start forwarding logs to the shared buffer only once this frame turns out to contain
    // a video. With `<all_urls>` we run in every ad and tracking iframe on the page, and
    // their chatter would evict the entries that actually matter. Everything is still
    // buffered locally and backfilled if the frame does become interesting.
    onFirstVideoSeen: () => {
      log.setSink((events) => sendToBackground({ kind: 'log', events }), { backfill: true });
      sendReport();
    },

    onActiveChange: (video) => {
      if (!video) return;

      overlay.attach(video);

      const container = overlay.mountContainer;
      if (container) ensurePanel(video, container);

      const found = agent.report().find((v) => v.active);
      if (found) sendToBackground({ kind: 'video-detected', video: found });
      sendReport();
    },
  });

  agent.start();

  onMessage<ToContent>((message) => {
    switch (message.kind) {
      case 'request-report':
        sendReport();
        return;

      case 'toggle-panel':
        // Every frame receives this; only the one hosting the panel acts on it.
        panel?.toggle();
        return;
    }
  });

  function sendReport(): void {
    if (!contextAlive()) return;
    sendToBackground({
      kind: 'frame-report',
      report: {
        url: location.href,
        origin: location.origin,
        isTop: window.top === window,
        hasPanel: panel?.isMounted ?? false,
        videos: agent.report(),
        updatedAt: Date.now(),
      },
    });
  }

  // Keep the debug frame tree's currentTime/readyState fields live while something plays.
  setInterval(() => {
    if (agent.activeVideo && !agent.activeVideo.paused) sendReport();
  }, 2000);

  log.debug('frame', `content script ready in ${location.origin}`, {
    isTop: window.top === window,
    url: location.href.slice(0, 200),
  });
}
