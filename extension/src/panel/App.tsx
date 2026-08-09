import { useEffect, useMemo, useRef } from 'react';
import type { SubtitleOverlay } from '@/content/overlay';
import { usePanel } from '@/panel/store';
import { CueLookup } from '@/lib/subtitles/lookup';
import { toCueTime } from '@/lib/sync';
import { Banner, clock } from '@/panel/components/ui';
import { SubtitlesTab } from '@/panel/components/SubtitlesTab';
import { StyleTab } from '@/panel/components/StyleTab';
import { SyncTab } from '@/panel/components/SyncTab';
import { SitesTab } from '@/panel/components/SitesTab';

/** How often the panel samples playback position. Enough for a smooth highlight. */
const TICK_MS = 120;

const TABS = [
  { id: 'subtitles', label: 'Subtitles' },
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
  const track = usePanel((s) => s.track);

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
  const error = usePanel((s) => s.error);
  const notice = usePanel((s) => s.notice);
  const dismiss = usePanel((s) => s.dismiss);
  const time = usePanel((s) => s.time);
  const duration = usePanel((s) => s.duration);

  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{ dx: number; dy: number } | null>(null);

  const onPointerDown = (event: React.PointerEvent) => {
    const element = ref.current;
    if (!element) return;
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
    drag.current = null;
    (event.target as HTMLElement).releasePointerCapture(event.pointerId);
  };

  return (
    <div
      ref={ref}
      style={{ left: prefs.x, top: prefs.y, pointerEvents: 'auto' }}
      className="absolute flex max-h-[85%] w-[340px] flex-col overflow-hidden rounded-lg border border-white/15 bg-neutral-900/95 font-sans text-white shadow-2xl backdrop-blur-sm"
    >
      <header
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        className="flex cursor-grab touch-none items-center gap-2 border-b border-white/10 bg-white/5 px-2.5 py-1.5 active:cursor-grabbing"
      >
        <span className="text-[11px] font-semibold tracking-wide text-sky-400">CC</span>
        <span className="text-[11px] font-medium text-white/80">Subtitler</span>
        <span className="ml-auto font-mono text-[10px] tabular-nums text-white/40">
          {clock(time)}
          {duration > 0 && ` / ${clock(duration)}`}
        </span>
        <button
          type="button"
          onClick={() => setOpen(false)}
          title="Collapse"
          className="rounded px-1 text-white/50 hover:bg-white/10 hover:text-white"
        >
          −
        </button>
      </header>

      <nav className="flex gap-0.5 border-b border-white/10 px-1.5 pt-1.5">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setPrefs({ tab: tab.id })}
            className={`rounded-t px-2.5 py-1 text-[11px] font-medium transition-colors ${
              prefs.tab === tab.id
                ? 'bg-white/10 text-white'
                : 'text-white/45 hover:bg-white/5 hover:text-white/70'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <div className="flex-1 overflow-y-auto p-2.5">
        {(error || notice) && (
          <div className="mb-2.5">
            <Banner tone={error ? 'error' : 'info'} onDismiss={dismiss}>
              {error ?? notice}
            </Banner>
          </div>
        )}

        {prefs.tab === 'subtitles' && <SubtitlesTab />}
        {prefs.tab === 'sync' && <SyncTab />}
        {prefs.tab === 'style' && <StyleTab />}
        {prefs.tab === 'sites' && <SitesTab />}
      </div>

      <footer className="flex items-center gap-2 border-t border-white/10 px-2.5 py-1.5">
        <span className="text-[10px] text-white/30">
          <kbd className="text-white/50">S</kbd> sync · <kbd className="text-white/50">G</kbd>/
          <kbd className="text-white/50">H</kbd> nudge ·{' '}
          <kbd className="text-white/50">Shift+S</kbd> hide
        </span>
      </footer>
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
  const track = usePanel((s) => s.track);
  const sync = usePanel((s) => s.sync);
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
