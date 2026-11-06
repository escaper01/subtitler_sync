import { useEffect, useState } from 'react';
import type { Release } from '@/lib/api-types';
import { PAGE_SIZE } from '@/lib/api-types';
import { usePanel, trackKey } from '@/panel/store';
import { useTv } from '@/panel/tvStore';
import { Button, TextInput } from '@/panel/components/ui';
import { LanguagePicker } from '@/panel/components/LanguagePicker';
import { SeriesBrowser } from '@/panel/components/SeriesBrowser';

/** Matches the API's own limit, so over-long titles are rejected before a round trip. */
const MAX_QUERY_LENGTH = 100;

/**
 * Search subtitlecat for a track instead of supplying one.
 *
 * The shape follows what the search actually returns: a list of *releases* (someone's
 * upload, named after the video file it was timed against), each holding one subtitle per
 * language. Five per page, all expanded, so taking the top one is a single click after the
 * search.
 *
 * Picking a release by its filename is not cosmetic: a track timed against the same rip
 * you are watching needs no syncing at all.
 */
export function FindTab() {
  const seriesShow = useTv((s) => s.show);
  const seriesPosition = useTv((s) => s.position);

  // Once the Series browser has a show open on a specific episode, `pickEpisode` is
  // driving every search — the query box and language pickers below stop being anything
  // the user needs to look at. Collapse them, but only on the moment that becomes true,
  // so a user who reopens them by hand keeps them open while browsing the rest of the
  // season, and they come back automatically once no series is active (a plain film
  // search, where this row is the only way to search at all).
  const seriesActive = seriesShow !== null && seriesPosition !== null;
  const [customOpen, setCustomOpen] = useState(!seriesActive);
  useEffect(() => {
    setCustomOpen(!seriesActive);
  }, [seriesActive]);

  return (
    <div className="space-y-2.5">
      {/* Above the query box, because the point of it is to fill that box in. TV only —
          TVmaze has no films, so for a film the box below is still typed into directly. */}
      <SeriesBrowser />

      <CustomSearch open={customOpen} onToggle={() => setCustomOpen(!customOpen)} />

      <Refusal />

      <Results />
    </div>
  );
}

/**
 * The query box, the language pickers and the Search button — collapsible once the Series
 * browser is driving searches on its own, and always reachable by hand regardless.
 */
function CustomSearch({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const find = usePanel((s) => s.find);
  const language = usePanel((s) => s.language);
  const setLanguage = usePanel((s) => s.setLanguage);
  const setQuery = usePanel((s) => s.setQuery);
  const runSearch = usePanel((s) => s.runSearch);

  const searching = find.status === 'searching';

  return (
    <div className="rounded border border-white/10 bg-black/20">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-1.5 px-2 py-1.5 text-left hover:bg-white/5"
      >
        <span className="text-[9px] text-white/35">{open ? '▾' : '▸'}</span>
        <span className="text-[11px] font-medium text-white/75">Custom search</span>
        {!open && (
          <span className="ml-auto max-w-40 truncate text-[10px] text-white/35">
            {find.query || 'type a title instead'}
          </span>
        )}
      </button>

      {open && (
        <div className="space-y-1.5 border-t border-white/10 px-2 py-2">
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
        </div>
      )}
    </div>
  );
}

/**
 * What went wrong, if something did.
 *
 * The panel never decides on its own that a search will fail — it renders whatever the
 * worker came back with. Two sources of truth drift apart; one does not. So the query box
 * stays usable and the reason arrives only once a search is actually attempted.
 *
 * This used to carry a case per paywall state, and then a server-owned button. Neither
 * exists now: there is no server, and the one failure worth rendering differently is
 * subtitlecat itself asking us to slow down.
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

  return <p className="text-[11px] text-red-300">{find.error}</p>;
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

/**
 * One release: its filename, how popular it is, and a button for its track in the chosen
 * language. Flat, not expandable — there is nothing under a chevron this row does not say.
 *
 * The parser's own guarantee (at most one track per language per release — it
 * de-duplicates on the code) is what makes "the first track" safe to treat as "the track".
 */
function ReleaseRow({ release }: { release: Release }) {
  const find = usePanel((s) => s.find);
  const toggleRelease = usePanel((s) => s.toggleRelease);
  const retryRelease = usePanel((s) => s.retryRelease);
  const loadTrack = usePanel((s) => s.loadTrack);

  const tracks = find.tracks[release.id];
  const busy = find.expanding.includes(release.id);
  const failed = find.failed.includes(release.id);

  // Every release on a page arrives already expanded, so this is normally a no-op —
  // `toggleRelease` returns immediately once `tracks` is defined. It only does real work
  // for the rare release whose eager expansion failed in the worker (searchSubtitles
  // swallows a single release's failure with Promise.allSettled), where this is the retry.
  useEffect(() => {
    if (tracks === undefined && !busy && !failed) void toggleRelease(release);
    // Re-run only when the release itself changes — `toggleRelease` and `busy` are not
    // meant to restart this on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [release.id]);

  const track = tracks?.[0] ?? null;
  const loading = track !== null && find.loading === trackKey(track);

  return (
    <li className="flex items-center gap-3 rounded border border-white/10 bg-black/20 px-2.5 py-2">
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

      <span className="shrink-0">
        {tracks !== undefined ? (
          track ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => void loadTrack(track)}
              disabled={find.loading !== null}
            >
              {loading ? 'Loading…' : 'Use'}
            </Button>
          ) : (
            <span className="text-[10px] text-white/25">Not available</span>
          )
        ) : failed ? (
          <Button size="sm" variant="ghost" onClick={() => void retryRelease(release)}>
            Retry
          </Button>
        ) : (
          <span className="text-[10px] text-white/30">Loading…</span>
        )}
      </span>
    </li>
  );
}
