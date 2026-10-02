import { useRef, useState } from 'react';
import { usePanel } from '@/panel/store';
import { Button, clock } from '@/panel/components/ui';
import { videoLabel } from '@/lib/videoKey';

export function SubtitlesTab() {
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
        <div className="text-xs font-medium text-white/80">Drop a subtitle file here</div>
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

      <LoadedTrack />

      <p className="text-[10px] leading-relaxed text-white/35">
        Saved for <span className="text-white/50">{videoLabel()}</span> — the file and its
        timing come back automatically next time you open this page.
      </p>
    </div>
  );
}

/** The loaded track, with what is known about it and the controls that act on it. */
function LoadedTrack() {
  const track = usePanel((s) => s.track);
  const visible = usePanel((s) => s.subtitlesVisible);
  const setVisible = usePanel((s) => s.setSubtitlesVisible);
  const clearTrack = usePanel((s) => s.clearTrack);

  const [showWarnings, setShowWarnings] = useState(false);

  if (!track) return null;

  return (
    <div className="rounded border border-white/10 bg-black/30 p-2.5">
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
        <Button size="sm" onClick={() => setVisible(!visible)}>
          {visible ? 'Hide' : 'Show'}
        </Button>
        <Button size="sm" variant="danger" onClick={clearTrack}>
          Remove
        </Button>
      </div>
    </div>
  );
}
