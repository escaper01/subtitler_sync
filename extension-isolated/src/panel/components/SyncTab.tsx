import { useEffect, useMemo, useRef, useState } from 'react';
import type { Cue } from '@/types';
import { selectSync, selectTrack, usePanel } from '@/panel/store';
import { CueLookup } from '@/lib/subtitles/lookup';
import { describeSync, snapCandidate, toCueTime, toVideoTime } from '@/lib/sync';
import { Button, TextInput, clock } from '@/panel/components/ui';

const ROW_HEIGHT = 46;
const OVERSCAN = 4;
/** How long to leave auto-scroll off after the user scrolls the list themselves. */
const MANUAL_SCROLL_GRACE_MS = 4000;

export function SyncTab() {
  const track = usePanel(selectTrack);
  const sync = usePanel(selectSync);
  const time = usePanel((s) => s.time);

  const lookup = useMemo(() => (track ? new CueLookup(track.cues) : null), [track]);
  const activeIndex = useMemo(() => {
    if (!lookup) return -1;
    return lookup.findActive(toCueTime(time, sync))[0]?.index ?? -1;
  }, [lookup, time, sync]);

  if (!track) {
    return (
      <p className="py-6 text-center text-[11px] text-white/40">
        Load a subtitle file first — then click the line you just heard and everything lines up.
      </p>
    );
  }

  return (
    <div className="space-y-2.5">
      <OffsetBar />
      <CueList cues={track.cues} activeIndex={activeIndex} />
      <DriftFix />
    </div>
  );
}

/* ------------------------------------------------------------------ offset bar */

function OffsetBar() {
  const sync = usePanel(selectSync);
  const nudge = usePanel((s) => s.nudge);
  const reset = usePanel((s) => s.resetTiming);

  return (
    <div className="flex items-center gap-1.5 rounded border border-white/10 bg-black/30 px-2 py-1.5">
      <span className="text-[10px] text-white/40">Timing</span>
      <span className="font-mono text-[11px] tabular-nums text-white/90">{describeSync(sync)}</span>
      <div className="ml-auto flex gap-1">
        <Button size="sm" variant="ghost" onClick={() => nudge(-0.5)} title="Subtitles 0.5s earlier">
          −0.5
        </Button>
        <Button size="sm" variant="ghost" onClick={() => nudge(-0.1)}>
          −0.1
        </Button>
        <Button size="sm" variant="ghost" onClick={() => nudge(0.1)}>
          +0.1
        </Button>
        <Button size="sm" variant="ghost" onClick={() => nudge(0.5)} title="Subtitles 0.5s later">
          +0.5
        </Button>
        <Button size="sm" variant="ghost" onClick={reset} title="Back to the file's own timing">
          Reset
        </Button>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------- cue list */

function CueList({ cues, activeIndex }: { cues: Cue[]; activeIndex: number }) {
  const sync = usePanel(selectSync);
  const clickMode = usePanel((s) => s.clickMode);
  const syncToCue = usePanel((s) => s.syncToCue);

  const [query, setQuery] = useState('');
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(260);

  const viewportRef = useRef<HTMLDivElement>(null);
  const lastManualScroll = useRef(0);
  const lastAutoScrolled = useRef(-1);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return cues;
    return cues.filter((cue) => cue.lines.join(' ').toLowerCase().includes(needle));
  }, [cues, query]);

  // Keep the active line in view, unless the user is scrolling around themselves.
  useEffect(() => {
    if (activeIndex < 0 || query) return;
    if (activeIndex === lastAutoScrolled.current) return;
    if (Date.now() - lastManualScroll.current < MANUAL_SCROLL_GRACE_MS) return;

    const position = filtered.findIndex((cue) => cue.index === activeIndex);
    if (position < 0) return;

    lastAutoScrolled.current = activeIndex;
    viewportRef.current?.scrollTo({
      top: Math.max(0, position * ROW_HEIGHT - viewportHeight / 2 + ROW_HEIGHT / 2),
      behavior: 'smooth',
    });
  }, [activeIndex, filtered, query, viewportHeight]);

  useEffect(() => {
    const element = viewportRef.current;
    if (!element) return;
    const observer = new ResizeObserver(() => setViewportHeight(element.clientHeight));
    observer.observe(element);
    setViewportHeight(element.clientHeight);
    return () => observer.disconnect();
  }, []);

  // Only the rows on screen are rendered — a two-hour film is ~1500 of them.
  const start = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
  const end = Math.min(filtered.length, Math.ceil((scrollTop + viewportHeight) / ROW_HEIGHT) + OVERSCAN);
  const visible = filtered.slice(start, end);

  const hint =
    clickMode === 'quick'
      ? 'Click the line you just heard'
      : `Click the line to use as anchor ${clickMode === 'anchorA' ? 'A' : 'B'}`;

  return (
    <div>
      <div className="mb-1.5 flex items-center gap-1.5">
        <TextInput
          value={query}
          onChange={setQuery}
          placeholder="Search lines…"
          className="flex-1"
        />
        <span
          className={`shrink-0 text-[10px] ${clickMode === 'quick' ? 'text-white/40' : 'text-sky-300'}`}
        >
          {hint}
        </span>
      </div>

      <div
        ref={viewportRef}
        onScroll={(e) => {
          setScrollTop(e.currentTarget.scrollTop);
          lastManualScroll.current = Date.now();
        }}
        className="h-64 overflow-y-auto rounded border border-white/10 bg-black/30"
      >
        {filtered.length === 0 ? (
          <div className="p-3 text-center text-[11px] text-white/35">No lines match "{query}".</div>
        ) : (
          <div style={{ height: filtered.length * ROW_HEIGHT, position: 'relative' }}>
            <div style={{ transform: `translateY(${start * ROW_HEIGHT}px)` }}>
              {visible.map((cue) => (
                <Row
                  key={cue.index}
                  cue={cue}
                  active={cue.index === activeIndex}
                  shownAt={toVideoTime(cue.start, sync)}
                  onClick={() => syncToCue(cue)}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Row({
  cue,
  active,
  shownAt,
  onClick,
}: {
  cue: Cue;
  active: boolean;
  shownAt: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{ height: ROW_HEIGHT }}
      className={`flex w-full items-start gap-2 border-b border-white/5 px-2 py-1 text-left transition-colors ${
        active ? 'bg-sky-500/25' : 'hover:bg-white/10'
      }`}
    >
      <span
        className={`mt-px shrink-0 font-mono text-[10px] tabular-nums ${
          active ? 'text-sky-200' : 'text-white/35'
        }`}
      >
        {clock(shownAt)}
      </span>
      <span
        className={`line-clamp-2 text-[11px] leading-tight ${active ? 'text-white' : 'text-white/70'}`}
      >
        {cue.lines.join(' ')}
      </span>
    </button>
  );
}

/* ------------------------------------------------------------------ drift fix */

function DriftFix() {
  const sync = usePanel(selectSync);
  const clickMode = usePanel((s) => s.clickMode);
  const setClickMode = usePanel((s) => s.setClickMode);
  const clearAnchors = usePanel((s) => s.clearAnchors);
  const applyDriftFit = usePanel((s) => s.applyDriftFit);
  const applyScale = usePanel((s) => s.applyScale);

  const [open, setOpen] = useState(false);
  const [a, b] = sync.anchors;
  const snap = snapCandidate(sync.scale);

  return (
    <div className="rounded border border-white/10 bg-black/20">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-1.5 px-2 py-1.5 text-left"
      >
        <span className="text-[11px] font-medium text-white/70">{open ? '▾' : '▸'} Fix drift</span>
        <span className="text-[10px] text-white/35">
          subtitles start right but slip later
        </span>
      </button>

      {open && (
        <div className="space-y-2 border-t border-white/10 px-2 py-2">
          <p className="text-[10px] leading-relaxed text-white/40">
            Caused by a framerate mismatch, so a single shift can't fix it. Mark one line near the
            start and another near the end, and the rate is solved from the pair.
          </p>

          <div className="grid grid-cols-2 gap-1.5">
            <AnchorSlot
              name="A"
              anchor={a}
              arming={clickMode === 'anchorA'}
              onArm={() => setClickMode(clickMode === 'anchorA' ? 'quick' : 'anchorA')}
            />
            <AnchorSlot
              name="B"
              anchor={b}
              arming={clickMode === 'anchorB'}
              onArm={() => setClickMode(clickMode === 'anchorB' ? 'quick' : 'anchorB')}
            />
          </div>

          <div className="flex gap-1.5">
            <Button size="sm" variant="primary" disabled={!a || !b} onClick={applyDriftFit}>
              Apply rate fix
            </Button>
            <Button size="sm" variant="ghost" disabled={!a && !b} onClick={clearAnchors}>
              Clear anchors
            </Button>
          </div>

          {snap && (
            <div className="rounded border border-emerald-400/30 bg-emerald-500/10 px-2 py-1.5">
              <div className="text-[10px] text-emerald-200">
                That rate is very close to <strong>{snap.label}</strong>. Snapping to the exact ratio
                removes the last of the drift.
              </div>
              <div className="mt-1">
                <Button size="sm" onClick={() => applyScale(snap.value)}>
                  Snap to {snap.label}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function AnchorSlot({
  name,
  anchor,
  arming,
  onArm,
}: {
  name: string;
  anchor: { cueStart: number; videoTime: number } | null;
  arming: boolean;
  onArm: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onArm}
      className={`rounded border px-2 py-1.5 text-left transition-colors ${
        arming
          ? 'border-sky-400 bg-sky-500/20'
          : anchor
            ? 'border-white/15 bg-white/5 hover:bg-white/10'
            : 'border-dashed border-white/20 hover:border-white/40'
      }`}
    >
      <div className="text-[10px] font-medium text-white/70">
        Anchor {name}
        {arming && <span className="ml-1 text-sky-300">— pick a line</span>}
      </div>
      {anchor ? (
        <div className="mt-0.5 font-mono text-[10px] tabular-nums text-white/50">
          {clock(anchor.cueStart)} → {clock(anchor.videoTime)}
        </div>
      ) : (
        <div className="mt-0.5 text-[10px] text-white/30">not set</div>
      )}
    </button>
  );
}
