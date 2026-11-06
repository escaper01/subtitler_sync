import { useEffect, useMemo, useRef } from 'react';
import type { SubtitleOverlay } from '@/content/overlay';
import { selectSync, selectTrack, usePanel } from '@/panel/store';
import { CueLookup } from '@/lib/subtitles/lookup';
import { toCueTime } from '@/lib/sync';
import { clock } from '@/panel/components/ui';
import { SubtitlesTab } from '@/panel/components/SubtitlesTab';
import { FindTab } from '@/panel/components/FindTab';
import { StyleTab } from '@/panel/components/StyleTab';
import { SyncTab } from '@/panel/components/SyncTab';
import { SitesTab } from '@/panel/components/SitesTab';
import { PanelBanner } from '@/panel/components/PanelBanner';

/** How often the panel samples playback position. Enough for a smooth highlight. */
const TICK_MS = 120;

const TABS = [
  { id: 'subtitles', label: 'File' },
  { id: 'find', label: 'Find' },
  { id: 'sync', label: 'Sync' },
  { id: 'style', label: 'Style' },
  { id: 'sites', label: 'Sites' },
] as const;

export function App({ video, overlay }: { video: HTMLVideoElement; overlay: SubtitleOverlay }) {
  const init = usePanel((s) => s.init);
  const ready = usePanel((s) => s.ready);
  const open = usePanel((s) => s.open);
  const tick = usePanel((s) => s.tick);

  useEffect(() => {
    void init({ video, overlay });
  }, [init, video, overlay]);

  useEffect(() => {
    const timer = setInterval(tick, TICK_MS);
    return () => clearInterval(timer);
  }, [tick]);

  useHotkeys();

  if (!ready) return null;
  return open ? <Panel /> : <Handle />;
}

/* ------------------------------------------------------------------- collapsed */

function Handle() {
  const setOpen = usePanel((s) => s.setOpen);
  const track = usePanel(selectTrack);

  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      style={{ pointerEvents: 'auto' }}
      className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full border border-white/15 bg-black/70 px-2.5 py-1.5 text-[11px] font-medium text-white/80 backdrop-blur transition-colors hover:bg-black/85 hover:text-white"
      title="Open Subtitler (Alt+Shift+S)"
    >
      <span className="text-sky-400">CC</span>
      {track ? <span className="max-w-32 truncate text-white/50">{track.name}</span> : 'Subtitles'}
    </button>
  );
}

/* ----------------------------------------------------------------------- panel */

function Panel() {
  const prefs = usePanel((s) => s.prefs);
  const setPrefs = usePanel((s) => s.setPrefs);
  const setOpen = usePanel((s) => s.setOpen);
  const time = usePanel((s) => s.time);
  const duration = usePanel((s) => s.duration);

  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{ dx: number; dy: number } | null>(null);

  const onPointerDown = (event: React.PointerEvent) => {
    const element = ref.current;
    if (!element) return;
    // Tabs and buttons in the bar must stay clickable; capture would swallow their click.
    if ((event.target as HTMLElement).closest('button')) return;
    drag.current = { dx: event.clientX - prefs.x, dy: event.clientY - prefs.y };
    (event.target as HTMLElement).setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: React.PointerEvent) => {
    const state = drag.current;
    const element = ref.current;
    if (!state || !element) return;

    // Keep the panel inside the player, or a drag near the edge can strand it off-screen.
    const bounds = element.parentElement?.getBoundingClientRect();
    const maxX = Math.max(0, (bounds?.width ?? 0) - element.offsetWidth);
    const maxY = Math.max(0, (bounds?.height ?? 0) - element.offsetHeight);

    setPrefs({
      x: Math.min(maxX, Math.max(0, event.clientX - state.dx)),
      y: Math.min(maxY, Math.max(0, event.clientY - state.dy)),
    });
  };

  const onPointerUp = (event: React.PointerEvent) => {
    if (!drag.current) return;
    drag.current = null;
    (event.target as HTMLElement).releasePointerCapture(event.pointerId);
  };

  return (
    <div
      ref={ref}
      style={{ left: prefs.x, top: prefs.y, pointerEvents: 'auto' }}
      className="@container absolute flex max-h-[92%] w-[40%] min-w-[320px] max-w-full flex-col overflow-hidden rounded-lg border border-white/15 bg-neutral-900/95 font-sans text-white shadow-2xl backdrop-blur-sm"
    >
      {/* One bar: drag handle, tabs, clock, collapse. The empty space is the drag area. */}
      <header
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        className="flex cursor-grab touch-none items-end gap-0.5 border-b border-white/10 bg-white/5 px-1.5 pt-1 active:cursor-grabbing"
      >
        <span
          className="self-center px-1 text-[11px] font-semibold tracking-wide text-sky-400"
          title="Subtitler — S: sync to line · G/H: nudge −/+0.1s · Shift+S: hide"
        >
          CC
        </span>
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setPrefs({ tab: tab.id })}
            className={`rounded-t px-2 py-1 text-[11px] font-medium transition-colors ${
              prefs.tab === tab.id
                ? 'bg-white/10 text-white'
                : 'text-white/45 hover:bg-white/5 hover:text-white/70'
            }`}
          >
            {tab.label}
          </button>
        ))}
        <span
          className="ml-auto self-center whitespace-nowrap pl-1 font-mono text-[10px] tabular-nums text-white/40"
          title={duration > 0 ? `${clock(time)} / ${clock(duration)}` : undefined}
        >
          {clock(time)}
          {duration > 0 && <span className="hidden @sm:inline"> / {clock(duration)}</span>}
        </span>
        <button
          type="button"
          onClick={() => setOpen(false)}
          title="Collapse"
          className="mb-0.5 self-center rounded px-1.5 text-white/50 hover:bg-white/10 hover:text-white"
        >
          −
        </button>
      </header>

      <div className="flex-1 overflow-y-auto p-2.5">
        <PanelBanner />

        {prefs.tab === 'subtitles' && <SubtitlesTab />}
        {prefs.tab === 'find' && <FindTab />}
        {prefs.tab === 'sync' && <SyncTab />}
        {prefs.tab === 'style' && <StyleTab />}
        {prefs.tab === 'sites' && <SitesTab />}
      </div>

      <Toast />
    </div>
  );
}

/* ----------------------------------------------------------------------- toast */

/**
 * Errors and notices float over the bottom of the panel and clear themselves, so they cost
 * no layout height. Absolutely positioned inside the panel (which is itself `absolute`).
 */
function Toast() {
  const error = usePanel((s) => s.error);
  const notice = usePanel((s) => s.notice);
  const action = usePanel((s) => s.noticeAction);
  const dismiss = usePanel((s) => s.dismiss);

  const message = error ?? notice;
  const act = error ? null : action;

  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(dismiss, error ? 6000 : act ? 8000 : 2800);
    return () => clearTimeout(timer);
  }, [message, error, act, dismiss]);

  if (!message) return null;
  return (
    <div
      role="status"
      className={`absolute inset-x-2 bottom-2 z-20 flex items-center gap-2 rounded border px-2 py-1.5 text-[11px] shadow-lg backdrop-blur ${
        error
          ? 'border-red-400/40 bg-red-950/90 text-red-100'
          : 'border-sky-400/30 bg-neutral-800/95 text-sky-50'
      }`}
    >
      <span className="min-w-0 flex-1">{message}</span>
      {act && (
        <button
          type="button"
          onClick={() => {
            act.run();
          }}
          className="shrink-0 rounded bg-sky-500 px-1.5 py-0.5 font-medium text-white hover:bg-sky-400"
        >
          {act.label}
        </button>
      )}
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        className="shrink-0 text-white/50 hover:text-white"
      >
        ×
      </button>
    </div>
  );
}

/* --------------------------------------------------------------------- hotkeys */

/**
 * Single-key shortcuts, active only while the panel is open.
 *
 * Requiring the panel to be open is the opt-in: bare letter keys are cheap to press while
 * watching, but hijacking them unconditionally would collide with the player's own
 * shortcuts for anyone who never uses this feature.
 */
function useHotkeys() {
  const open = usePanel((s) => s.open);
  const track = usePanel(selectTrack);
  const sync = usePanel(selectSync);
  const nudge = usePanel((s) => s.nudge);
  const syncToCue = usePanel((s) => s.syncToCue);
  const setOpen = usePanel((s) => s.setOpen);
  const bridge = usePanel((s) => s.bridge);

  const lookup = useMemo(() => (track ? new CueLookup(track.cues) : null), [track]);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;

      // composedPath, not target: the real element is inside our shadow root, and `target`
      // is retargeted to the host from the document's point of view.
      const source = event.composedPath()[0];
      if (source instanceof HTMLElement) {
        if (/^(INPUT|TEXTAREA|SELECT)$/.test(source.tagName) || source.isContentEditable) return;
      }

      switch (event.key.toLowerCase()) {
        case 'g':
          nudge(-0.1);
          break;
        case 'h':
          nudge(0.1);
          break;
        case 's': {
          if (event.shiftKey) {
            setOpen(false);
            break;
          }
          if (!lookup || !bridge) return;
          const cue = lookup.findActive(toCueTime(bridge.video.currentTime, sync))[0];
          if (cue) syncToCue(cue);
          break;
        }
        default:
          return;
      }

      event.preventDefault();
      event.stopPropagation();
    };

    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [open, lookup, sync, bridge, nudge, syncToCue, setOpen]);
}
