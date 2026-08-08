import type {
  DebugSnapshot,
  FrameReport,
  LogEvent,
  ToBackground,
  ToBackgroundFromDebug,
} from '@/types';
import { broadcastToTab, onMessage } from '@/lib/messaging';
import {
  clearDiagnostics,
  eventBuffer,
  installNetworkLogging,
  netBuffer,
  restoreDiagnostics,
  schedulePersist,
} from '@/background/netlog';

/**
 * Service worker.
 *
 * Its jobs are narrow: keep the network/event log, know which frame of which tab owns the
 * active video, and route the few messages that must cross a context boundary. Subtitle
 * state itself never comes through here — the panel and the overlay live in the same frame
 * and talk directly (see CLAUDE.md).
 *
 * Note that MV3 suspends this worker after ~30s idle, so nothing here may assume its
 * in-memory state survives. The frame registry is treated as a cache that is refreshed on
 * demand, and the diagnostic buffers are mirrored into storage.session.
 */

/** tabId → frameId → latest self-report. Rebuilt on demand; never authoritative. */
const frames = new Map<number, Map<number, FrameReport>>();

/** tabId → frameId of the frame that owns the video we attached to. */
const activeVideoFrame = new Map<number, number>();

function framesFor(tabId: number): Map<number, FrameReport> {
  let map = frames.get(tabId);
  if (!map) {
    map = new Map();
    frames.set(tabId, map);
  }
  return map;
}

function pushEvents(events: LogEvent[], frameId?: number): void {
  for (const event of events) {
    eventBuffer.push(frameId === undefined ? event : { ...event, frameId });
  }
  schedulePersist();
}

/* ------------------------------------------------------------------- lifecycle */

installNetworkLogging();
void restoreDiagnostics();

chrome.tabs.onRemoved.addListener((tabId) => {
  frames.delete(tabId);
  activeVideoFrame.delete(tabId);
});

// A frame that navigates has thrown away its content script along with its DOM; drop the
// stale report so the debug tree doesn't show a video that no longer exists.
chrome.webNavigation.onCommitted.addListener(({ tabId, frameId }) => {
  framesFor(tabId).delete(frameId);
  if (activeVideoFrame.get(tabId) === frameId) activeVideoFrame.delete(tabId);
});

/* --------------------------------------------------------------------- routing */

onMessage<ToBackground | ToBackgroundFromDebug>((message, sender) => {
  const tabId = sender.tab?.id;
  const frameId = sender.frameId;

  switch (message.kind) {
    case 'frame-report': {
      if (tabId === undefined || frameId === undefined) return;
      // A frame cannot know its own parent frameId; buildSnapshot fills this in from
      // chrome.webNavigation, which is the only source for the frame hierarchy.
      const report: FrameReport = { ...message.report, frameId, parentFrameId: -1 };
      framesFor(tabId).set(frameId, report);
      return;
    }

    case 'video-detected': {
      if (tabId === undefined || frameId === undefined) return;
      activeVideoFrame.set(tabId, frameId);
      eventBuffer.push({
        t: Date.now(),
        level: 'info',
        scope: 'bg',
        message: `video attached in frame ${frameId}`,
        data: { duration: message.video.duration, size: `${message.video.videoWidth}x${message.video.videoHeight}` },
        frameId,
      });
      schedulePersist();
      return;
    }

    case 'log': {
      pushEvents(message.events, frameId);
      return;
    }

    case 'open-debug': {
      void openDebugTab();
      return;
    }

    case 'debug:list-tabs': {
      return chrome.tabs
        .query({})
        .then((tabs) =>
          tabs
            .filter((t) => t.id !== undefined && t.url && /^https?:/.test(t.url))
            .map((t) => ({ id: t.id!, title: t.title ?? '', url: t.url ?? '' })),
        );
    }

    case 'debug:get-snapshot': {
      return buildSnapshot(message.tabId);
    }

    case 'debug:clear': {
      clearDiagnostics();
      return { ok: true };
    }
  }
});

/* -------------------------------------------------------------- panel toggling */

chrome.action.onClicked.addListener((tab) => {
  if (tab.id !== undefined) void broadcastToTab(tab.id, { kind: 'toggle-panel' });
});

chrome.commands.onCommand.addListener((command, tab) => {
  if (command === 'toggle-panel' && tab?.id !== undefined) {
    void broadcastToTab(tab.id, { kind: 'toggle-panel' });
  } else if (command === 'open-debug') {
    void openDebugTab();
  }
});

/* ------------------------------------------------------------------ debug tab */

async function openDebugTab(): Promise<void> {
  const url = chrome.runtime.getURL('src/debug/debug.html');
  const existing = await chrome.tabs.query({ url });
  if (existing.length > 0 && existing[0]?.id !== undefined) {
    await chrome.tabs.update(existing[0].id, { active: true });
    await chrome.tabs.reload(existing[0].id);
    return;
  }
  await chrome.tabs.create({ url });
}

/**
 * Build a diagnostic snapshot for a tab.
 *
 * The in-memory frame registry may be empty (worker restarted) or stale, so every frame is
 * asked to re-report first and given a moment to answer. Frames Chrome knows about that
 * still don't answer are reported as "silent" — that is exactly the signal that the content
 * script failed to inject somewhere, which is the most common detection failure.
 */
async function buildSnapshot(requestedTabId?: number): Promise<DebugSnapshot> {
  const version = chrome.runtime.getManifest().version;

  let tabId = requestedTabId;
  let tabUrl: string | null = null;

  if (tabId === undefined) {
    const [active] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    tabId = active?.id;
    tabUrl = active?.url ?? null;
  } else {
    tabUrl = (await chrome.tabs.get(tabId).catch(() => null))?.url ?? null;
  }

  if (tabId === undefined) {
    return {
      version,
      generatedAt: Date.now(),
      tabId: null,
      tabUrl: null,
      frames: [],
      silentFrames: [],
      events: eventBuffer.all(),
      net: netBuffer.all(),
    };
  }

  await broadcastToTab(tabId, { kind: 'request-report' });
  await new Promise((resolve) => setTimeout(resolve, 300));

  const known = await chrome.webNavigation.getAllFrames({ tabId }).catch(() => null);
  const reported = framesFor(tabId);

  // Fill in parent relationships from webNavigation, which is the only place they're known.
  const frameList: FrameReport[] = [];
  for (const report of reported.values()) {
    const meta = known?.find((f) => f.frameId === report.frameId);
    frameList.push({ ...report, parentFrameId: meta?.parentFrameId ?? -1 });
  }
  frameList.sort((a, b) => a.frameId - b.frameId);

  const silentFrames = (known ?? [])
    .filter((f) => !reported.has(f.frameId))
    .map((f) => ({ frameId: f.frameId, parentFrameId: f.parentFrameId, url: f.url }));

  return {
    version,
    generatedAt: Date.now(),
    tabId,
    tabUrl,
    frames: frameList,
    silentFrames,
    events: eventBuffer.all(),
    net: netBuffer.all(),
  };
}
