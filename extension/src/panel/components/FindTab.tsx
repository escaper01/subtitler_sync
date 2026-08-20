import { useState } from 'react';
import type { Release } from '@/lib/api-types';
import { PAGE_SIZE } from '@/lib/api-types';
import { usePanel, trackKey } from '@/panel/store';
import { Button, TextInput } from '@/panel/components/ui';
import { LanguagePicker } from '@/panel/components/LanguagePicker';

/** Matches the API's own limit, so over-long titles are rejected before a round trip. */
const MAX_QUERY_LENGTH = 100;

/**
 * Search subtitlecat for a track instead of supplying one.
 *
 * The shape follows what the search actually returns: a list of *releases* (someone's
 * upload, named after the video file it was timed against), each holding one subtitle in
 * the chosen language. Five per page, all expanded, so taking the top one is a single
 * click after the search.
 *
 * Picking a release by its filename is not cosmetic: a track timed against the same rip
 * you are watching needs no syncing at all.
 */
export function FindTab() {
  const find = usePanel((s) => s.find);
  const language = usePanel((s) => s.language);
  const setLanguage = usePanel((s) => s.setLanguage);
  const setQuery = usePanel((s) => s.setQuery);
  const runSearch = usePanel((s) => s.runSearch);

  const searching = find.status === 'searching';

  return (
    <div className="space-y-2.5">
      <div className="flex gap-1.5">
        <TextInput
          value={find.query}
          onChange={setQuery}
          onEnter={() => void runSearch()}
          placeholder="Film or series name"
          maxLength={MAX_QUERY_LENGTH}
          className="min-w-0 flex-1"
        />
        <LanguagePicker selected={language} onChange={setLanguage} />
      </div>

      <Button
        size="sm"
        variant="primary"
        onClick={() => void runSearch()}
        disabled={find.query.trim().length < 2 || searching}
      >
        {searching ? 'Searching…' : 'Search'}
      </Button>

      <Refusal />

      <Results />
    </div>
  );
}

/**
 * What the server said, and what to do about it.
 *
 * The panel never decides on its own that a request will be refused — it renders whatever
 * came back. Two sources of truth drift apart; one does not. So the query box stays usable
 * and the reason arrives only once a search is actually attempted.
 *
 * This used to carry a case per paywall state — signed out, no subscription, lapsed,
 * device limit. None of those exist now; the only refusal a well-behaved client can hit is
 * the rate limiter, which is temporary and needs no button. The `action` branch is kept
 * anyway, because it is server-owned: it lets a refusal grow a link without shipping an
 * extension update through review.
 */
function Refusal() {
  const find = usePanel((s) => s.find);
  if (!find.error) return null;

  // Amber, not red: waiting is not the same as broken, and red for something that fixes
  // itself in a minute teaches people to ignore red.
  if (find.code === 'rate_limited') {
    return (
      <div className="rounded border border-amber-400/30 bg-amber-500/10 px-2 py-2">
        <p className="text-[11px] leading-relaxed text-white/85">{find.error}</p>
        <p className="mt-1 text-[10px] text-white/45">
          Loading your own subtitle file is never limited.
        </p>
      </div>
    );
  }

  // A plain error is just a sentence. One the server attached a button to gets the button.
  if (!find.action) {
    return <p className="text-[11px] text-red-300">{find.error}</p>;
  }

  return (
    <div className="rounded border border-sky-400/30 bg-sky-500/10 px-2 py-2">
      <p className="text-[11px] leading-relaxed text-white/85">{find.error}</p>
      <a
        href={find.action.url}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-2 inline-block rounded bg-sky-500 px-2.5 py-1 text-[11px] font-medium text-white transition-colors hover:bg-sky-400"
      >
        {find.action.label}
      </a>
    </div>
  );
}

function Results() {
  const find = usePanel((s) => s.find);
  const runSearch = usePanel((s) => s.runSearch);

  if (find.status === 'idle') {
    return (
      <p className="text-[10px] leading-relaxed text-white/30">
        Searches subtitlecat.com in your chosen language. Most subtitles there are machine
        translations, so prefer a release whose filename matches what you are watching.
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

  const first = (find.page - 1) * PAGE_SIZE + 1;
  const last = first + find.releases.length - 1;

  return (
    <div className="space-y-2">
      <ul className="space-y-1">
        {find.releases.map((release) => (
          <ReleaseRow key={release.id} release={release} />
        ))}
      </ul>

      <div className="flex items-center gap-2">
        <span className="flex-1 text-[10px] text-white/30">
          {first}–{last} of {find.total}
        </span>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => void runSearch(find.page - 1)}
          disabled={find.page <= 1}
        >
          Back
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => void runSearch(find.page + 1)}
          disabled={!find.hasMore}
        >
          More
        </Button>
      </div>
    </div>
  );
}

function ReleaseRow({ release }: { release: Release }) {
  const find = usePanel((s) => s.find);
  const toggleRelease = usePanel((s) => s.toggleRelease);
  const loadTrack = usePanel((s) => s.loadTrack);

  const tracks = find.tracks[release.id];
  // Everything on a page arrives expanded, so a row starts open unless its fetch failed.
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
          {busy && <p className="py-1 text-[10px] text-white/35">Loading…</p>}

          {!busy && tracks !== undefined && tracks.length === 0 && (
            <p className="py-1 text-[10px] text-white/35">Not available in this language.</p>
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
