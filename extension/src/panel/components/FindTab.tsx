import { useState } from 'react';
import type { Release } from '@/lib/api-types';
import { usePanel, trackKey } from '@/panel/store';
import { Button } from '@/panel/components/ui';
import { LanguagePicker } from '@/panel/components/LanguagePicker';

/**
 * Search subtitlecat for a track instead of supplying one.
 *
 * The shape follows what the search actually returns: a list of *releases* (someone's
 * upload, named after the video file it was timed against), each holding one subtitle per
 * language. The best few arrive already expanded, so the common case — search, take the
 * English one off the top result — is one click after the search.
 *
 * Picking a release by its filename is not cosmetic: a track timed against the same rip
 * you are watching needs no syncing at all.
 */
export function FindTab() {
  const find = usePanel((s) => s.find);
  const languages = usePanel((s) => s.languages);
  const setLanguages = usePanel((s) => s.setLanguages);
  const setQuery = usePanel((s) => s.setQuery);
  const runSearch = usePanel((s) => s.runSearch);

  return (
    <div className="space-y-2.5">
      <div className="flex gap-1.5">
        <input
          type="text"
          value={find.query}
          placeholder="Film or series name"
          spellCheck={false}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void runSearch();
          }}
          className="min-w-0 flex-1 rounded border border-white/10 bg-black/40 px-1.5 py-1 text-[11px] text-white/85 outline-none placeholder:text-white/25 focus:border-sky-400/60"
        />
        <LanguagePicker selected={languages} onChange={setLanguages} />
      </div>

      <Button
        size="sm"
        variant="primary"
        onClick={() => void runSearch()}
        disabled={find.query.trim().length === 0 || find.status === 'searching'}
      >
        {find.status === 'searching' ? 'Searching…' : 'Search'}
      </Button>

      {find.error && <p className="text-[11px] text-red-300">{find.error}</p>}

      <Results />
    </div>
  );
}

function Results() {
  const find = usePanel((s) => s.find);

  if (find.status === 'idle') {
    return (
      <p className="text-[10px] leading-relaxed text-white/30">
        Searches subtitlecat.com. Results are filtered to your chosen languages — most of them
        are machine translations, so prefer a release whose filename matches what you are
        watching.
      </p>
    );
  }

  if (find.status === 'searching') {
    return <p className="text-[11px] text-white/40">Searching…</p>;
  }

  if (find.releases.length === 0) {
    return (
      <p className="text-[11px] text-white/40">
        Nothing found. Try a shorter title, or the original-language one.
      </p>
    );
  }

  return (
    <ul className="space-y-1">
      {find.releases.map((release) => (
        <ReleaseRow key={release.id} release={release} />
      ))}
    </ul>
  );
}

function ReleaseRow({ release }: { release: Release }) {
  const find = usePanel((s) => s.find);
  const toggleRelease = usePanel((s) => s.toggleRelease);
  const loadTrack = usePanel((s) => s.loadTrack);

  const tracks = find.tracks[release.id];
  // Anything the search expanded starts open; the rest are fetched on first click.
  const [open, setOpen] = useState(tracks !== undefined);
  const busy = find.expanding.includes(release.id);

  const onToggle = (): void => {
    setOpen(!open);
    if (!open) void toggleRelease(release);
  };

  return (
    <li className="rounded border border-white/10 bg-black/20">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-start gap-1.5 px-2 py-1.5 text-left hover:bg-white/5"
      >
        <span className="mt-px shrink-0 text-[9px] text-white/35">{open ? '▾' : '▸'}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[11px] text-white/85" title={release.title}>
            {release.title}
          </span>
          <span className="mt-0.5 flex items-center gap-1.5 text-[10px] text-white/35">
            {release.recommended && <span className="text-amber-300">★</span>}
            <span>{release.downloads.toLocaleString()} downloads</span>
            {release.sourceLanguage && <span>· from {release.sourceLanguage}</span>}
          </span>
        </span>
      </button>

      {open && (
        <div className="border-t border-white/5 px-2 py-1">
          {busy && <p className="py-1 text-[10px] text-white/35">Loading languages…</p>}

          {!busy && tracks !== undefined && tracks.length === 0 && (
            <p className="py-1 text-[10px] text-white/35">
              Nothing here in your languages.
            </p>
          )}

          {!busy &&
            tracks?.map((track) => {
              const loading = find.loading === trackKey(track);
              return (
                <div key={track.code} className="flex items-center gap-2 py-0.5">
                  <span className="min-w-0 flex-1 truncate text-[11px] text-white/70">
                    {track.name}
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => void loadTrack(track)}
                    disabled={find.loading !== null}
                  >
                    {loading ? 'Loading…' : 'Use'}
                  </Button>
                </div>
              );
            })}
        </div>
      )}
    </li>
  );
}
