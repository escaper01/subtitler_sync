import { useRef, useState } from 'react';
import type { SlotId, SubtitleTrack } from '@/types';
import { selectSlotId, usePanel } from '@/panel/store';
import { Button, clock } from '@/panel/components/ui';
import { videoLabel } from '@/lib/videoKey';

export function SubtitlesTab() {
  const dual = usePanel((s) => s.dual);
  const setDual = usePanel((s) => s.setDual);
  const slots = usePanel((s) => s.slots);
  const activeSlot = usePanel(selectSlotId);
  const loadFile = usePanel((s) => s.loadFile);

  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const onDrop = (event: React.DragEvent) => {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files[0];
    if (file) void loadFile(file);
  };

  return (
    <div className="space-y-3">
      <label className="flex cursor-pointer items-start gap-2 rounded border border-white/10 bg-black/20 px-2.5 py-2">
        <input
          type="checkbox"
          checked={dual.enabled}
          onChange={(e) => setDual({ enabled: e.target.checked })}
          className="mt-0.5 h-3.5 w-3.5 accent-sky-500"
        />
        <span className="flex-1">
          <span className="block text-[11px] font-medium text-white/85">Two subtitles at once</span>
          <span className="mt-0.5 block text-[10px] leading-relaxed text-white/40">
            Show a second track above the first — a different language, timed separately.
          </span>
        </span>
      </label>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className={`cursor-pointer rounded border border-dashed px-3 py-5 text-center transition-colors ${
          dragging ? 'border-sky-400 bg-sky-500/10' : 'border-white/20 hover:border-white/40'
        }`}
      >
        <div className="text-xs font-medium text-white/80">
          Drop a subtitle file here
          {dual.enabled && (
            <span className="text-sky-300"> — {activeSlot === 0 ? 'primary' : 'secondary'}</span>
          )}
        </div>
        <div className="mt-0.5 text-[10px] text-white/40">or click to browse — .srt or .vtt</div>
        <input
          ref={inputRef}
          type="file"
          accept=".srt,.vtt,text/plain,text/vtt"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void loadFile(file);
            e.target.value = '';
          }}
        />
      </div>

      {/* The inactive slot is listed too, so a loaded secondary is visible from here
          without switching to it — otherwise "did that load?" needs two clicks to answer. */}
      <LoadedTrack id={0} />
      {dual.enabled && <LoadedTrack id={1} />}

      {!dual.enabled && slots[1].track && (
        <p className="rounded border border-white/10 bg-black/20 px-2 py-1.5 text-[10px] leading-relaxed text-white/45">
          A second track is still loaded and will come back when you switch two subtitles
          on again.
        </p>
      )}

      <p className="text-[10px] leading-relaxed text-white/35">
        Saved for <span className="text-white/50">{videoLabel()}</span> — the file
        {dual.enabled ? 's and their timings come' : ' and its timing come'} back automatically
        next time you open this page.
      </p>
    </div>
  );
}

/** One slot's loaded track, with the controls that act on that slot specifically. */
function LoadedTrack({ id }: { id: SlotId }) {
  const slot = usePanel((s) => s.slots[id]);
  const dual = usePanel((s) => s.dual);
  const activeSlot = usePanel(selectSlotId);
  const setActiveSlot = usePanel((s) => s.setActiveSlot);
  const setSlotVisible = usePanel((s) => s.setSlotVisible);
  const clearTrack = usePanel((s) => s.clearTrack);

  const [showWarnings, setShowWarnings] = useState(false);

  const track: SubtitleTrack | null = slot.track;
  const isActive = activeSlot === id;

  if (!track) {
    if (!dual.enabled) return null;
    return (
      <div className="rounded border border-dashed border-white/10 px-2.5 py-2 text-[10px] text-white/30">
        {id === 0 ? 'Primary' : 'Secondary'} — nothing loaded
      </div>
    );
  }

  return (
    <div
      className={`rounded border p-2.5 ${
        dual.enabled && isActive ? 'border-sky-400/40 bg-sky-500/[0.07]' : 'border-white/10 bg-black/30'
      }`}
    >
      {dual.enabled && (
        <div className="mb-1 text-[9px] font-medium uppercase tracking-wide text-white/35">
          {id === 0 ? 'Primary' : 'Secondary'}
        </div>
      )}

      <div className="truncate text-xs font-medium text-white/90" title={track.name}>
        {track.name}
      </div>
      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-white/50">
        <span>{track.cues.length} lines</span>
        <span>{track.format.toUpperCase()}</span>
        <span>{track.encoding}</span>
        <span>
          {clock(track.cues[0]?.start ?? 0)} –{' '}
          {clock(track.cues[track.cues.length - 1]?.end ?? 0)}
        </span>
      </div>

      {track.warnings.length > 0 && (
        <div className="mt-2">
          <button
            type="button"
            onClick={() => setShowWarnings((v) => !v)}
            className="text-[10px] text-amber-300/90 hover:text-amber-200"
          >
            {showWarnings ? '▾' : '▸'} {track.warnings.length} parsing warning
            {track.warnings.length === 1 ? '' : 's'}
          </button>
          {showWarnings && (
            <ul className="mt-1 max-h-24 space-y-0.5 overflow-auto text-[10px] text-white/45">
              {track.warnings.map((warning, i) => (
                <li key={i}>• {warning}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="mt-2.5 flex flex-wrap gap-1.5">
        <Button size="sm" onClick={() => setSlotVisible(id, !slot.visible)}>
          {slot.visible ? 'Hide' : 'Show'}
        </Button>
        {/* Remove acts on the *active* slot, so a slot you are not editing has to be
            selected first. One button that always means "this one" is worth the extra
            click over two buttons where one silently deletes the wrong track. */}
        {isActive ? (
          <Button size="sm" variant="danger" onClick={clearTrack}>
            Remove
          </Button>
        ) : (
          <Button size="sm" onClick={() => setActiveSlot(id)}>
            Edit this one
          </Button>
        )}
      </div>
    </div>
  );
}
