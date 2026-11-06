import type { TabState, ToBackground, ToBackgroundFromPopup } from '@/types';
import { EMPTY_TAB_STATE } from '@/types';
import { broadcastToTab, onMessage } from '@/lib/messaging';
import {
  downloadSubtitle,
  fetchDonatePrompt,
  fetchRelease,
  getSourceStatus,
  searchSubtitles,
} from '@/lib/api';
import { fetchSeasons, searchShows } from '@/lib/tvmaze';

/**
 * Service worker.
 *
 * Its jobs are narrow: remember whether a tab turned out to contain a film, answer the
 * popup's questions about the current tab, relay the panel toggle, and run subtitle search
 * — which in this build means fetching subtitlecat itself (`lib/api.ts`) and handing the
 * HTML to the offscreen document to parse (`background/offscreen.ts`). Subtitle state never
 * comes through here — the panel and the overlay live in the same frame and talk directly
 * (see CLAUDE.md).
 *
 * MV3 suspends this worker after ~30s idle, so nothing here may assume its in-memory state
 * survives. What it holds is mirrored into `storage.session` and read back on wake, and
 * every mutation is sequenced after that restore so a wake-up cannot resurrect state that
 * was cleared in the meantime.
 */

const SESSION_KEY = 'tabs';

/** tabId → what we've seen there. A hint for the popup; never authoritative. */
const tabs = new Map<number, TabState>();

const hydrated: Promise<void> = chrome.storage.session
  .get(SESSION_KEY)
  .then((stored) => {
    const value = stored[SESSION_KEY] as Record<string, TabState> | undefined;
    for (const [tabId, state] of Object.entries(value ?? {})) tabs.set(Number(tabId), state);
  })
  .catch(() => {});

function persist(): void {
  void chrome.storage.session.set({ [SESSION_KEY]: Object.fromEntries(tabs) }).catch(() => {});
}

/** Run once the session state is back, so mutations never race the restore. */
function sequenced(fn: () => void): void {
  void hydrated.then(fn);
}

function update(tabId: number, patch: Partial<TabState>): void {
  sequenced(() => {
    tabs.set(tabId, { ...(tabs.get(tabId) ?? EMPTY_TAB_STATE), ...patch });
    persist();
  });
}

function forget(tabId: number): void {
  sequenced(() => {
    if (tabs.delete(tabId)) persist();
  });
}

/* ------------------------------------------------------------------- lifecycle */

chrome.tabs.onRemoved.addListener(forget);

// A tab that starts loading a new page has thrown away whatever we knew about it.
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'loading') forget(tabId);
});

/* --------------------------------------------------------------------- routing */

onMessage<ToBackground | ToBackgroundFromPopup>((message, sender) => {
  const tabId = sender.tab?.id;

  switch (message.kind) {
    case 'video-seen': {
      if (tabId !== undefined) update(tabId, { videoSeen: true });
      return;
    }

    case 'video-detected': {
      if (tabId !== undefined) update(tabId, { videoSeen: true, videoAttached: true });
      return;
    }

    case 'get-top-url': {
      // Asked by a frame that cannot read its own ancestor chain. `sender.tab.url` is the
      // tab's top-level URL, which is exactly what the allowlist is checked against.
      return Promise.resolve(sender.tab?.url ?? null);
    }

    case 'get-page-title': {
      // The panel runs in the player's iframe, whose own title is the embed's, not the
      // film's. Only the worker can see the tab's title.
      return Promise.resolve(sender.tab?.title ?? null);
    }

    case 'api:search': {
      return searchSubtitles(message.query, message.lang, message.page);
    }

    case 'api:release': {
      return fetchRelease(message.path, message.lang);
    }

    case 'api:download': {
      return downloadSubtitle(message.path);
    }

    case 'tv:search': {
      return searchShows(message.query);
    }

    case 'tv:seasons': {
      return fetchSeasons(message.showId);
    }

    case 'api:status': {
      return getSourceStatus();
    }

    case 'donate': {
      return fetchDonatePrompt();
    }

    case 'popup:get-tab-state': {
      return hydrated.then(() => tabs.get(message.tabId) ?? EMPTY_TAB_STATE);
    }

    case 'popup:toggle-panel': {
      return broadcastToTab(message.tabId, { kind: 'toggle-panel' }).then(() => ({ ok: true }));
    }
  }
});

/* -------------------------------------------------------------- panel toggling */

chrome.commands.onCommand.addListener((command, tab) => {
  if (command === 'toggle-panel' && tab?.id !== undefined) {
    void broadcastToTab(tab.id, { kind: 'toggle-panel' });
  }
});
