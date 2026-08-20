import { useState } from 'react';
import type { Release, Track } from '@/lib/api-types';
import { PAGE_SIZE } from '@/lib/api-types';
import type { SlotId } from '@/types';
import { usePanel, trackKey } from '@/panel/store';
import { languageName } from '@/lib/languages';
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
  const find = usePanel((s) => s.find);
  const language = usePanel((s) => s.language);
  const setLanguage = usePanel((s) => s.setLanguage);
  const setQuery = usePanel((s) => s.setQuery);
  const runSearch = usePanel((s) => s.runSearch);
  const dual = usePanel((s) => s.dual);
  const setDual = usePanel((s) => s.setDual);
  const language2 = usePanel((s) => s.language2);
  const setLanguage2 = usePanel((s) => s.setLanguage2);

  const searching = find.status === 'searching';

  /**
   * The control that was missing before. `dual.enabled` also lives on the File tab's
   * "Two subtitles at once" checkbox — they read and write the same store field, so
   * checking either one flips both. But a control that exists only on a tab someone has no
   * reason to visit while searching is not discoverable: you find it here, where you are
   * looking for a second language, or you do not find it.
   *
   * Turning it on also re-runs an already-completed search when the two languages differ —
   * the results on screen were fetched for one language, and would otherwise show an empty
   * second column until the next search.
   */
  const onToggleDual = (enabled: boolean) => {
    setDual({ enabled });
    if (enabled && language2 !== language && find.status === 'done') {
      void runSearch(find.page);
    }
  };

  return (
    <div className="space-y-2.5">
      {/* Above the query box, because the point of it is to fill that box in. TV only —
          TVmaze has no films, so for a film the box below is still typed into directly. */}
      <SeriesBrowser />

      <label className="flex cursor-pointer items-start gap-2 rounded border border-white/10 bg-black/20 px-2.5 py-2">
        <input
          type="checkbox"
          checked={dual.enabled}
          onChange={(e) => onToggleDual(e.target.checked)}
          className="mt-0.5 h-3.5 w-3.5 accent-sky-500"
        />
        <span className="flex-1">
          <span className="block text-[11px] font-medium text-white/85">
            Search two languages at once
          </span>
          <span className="mt-0.5 block text-[10px] leading-relaxed text-white/40">
            Results split into two columns, one per language, so you pick both from the same
            release in one pass.
          </span>
        </span>
      </label>

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

      {/* The second language sits below the search box rather than beside it: both
          languages are fetched in the one search, but this is still "the second track",
          not "another term to search for". */}
      {dual.enabled && (
        <div className="flex items-center gap-1.5 rounded border border-white/10 bg-black/20 px-2 py-1">
          <span className="text-[10px] text-white/45">Second subtitle</span>
          <div className="ml-auto">
            <LanguagePicker selected={language2} onChange={setLanguage2} />
          </div>
        </div>
      )}

      {dual.enabled && language2 === language && (
        <p className="text-[10px] leading-relaxed text-white/35">
          Both are set to {languageName(language)}. Pick a different second language to see
          two columns.
        </p>
      )}

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
  const dual = usePanel((s) => s.dual);
  const language = usePanel((s) => s.language);
  const language2 = usePanel((s) => s.language2);

  const tracks = find.tracks[release.id];
  // Everything on a page arrives expanded, so a row starts open unless its fetch failed.
  const [open, setOpen] = useState(tracks !== undefined);
  const busy = find.expanding.includes(release.id);

  // Two columns only when two languages were actually searched for. With dual on but the
  // two languages left equal, the search itself collapses to one language (see
  // searchLangParam in the store) — rendering two identical columns would be worse than one.
  const twoLangs = dual.enabled && language2 !== language;

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
            <p className="py-1 text-[10px] text-white/35">
              Not available in {twoLangs ? 'either language' : 'this language'}.
            </p>
          )}

          {!busy &&
            tracks !== undefined &&
            tracks.length > 0 &&
            (twoLangs ? (
              // The visual split: one release, its track in each language, side by side.
              // The API returns at most one track per language per release, so this is
              // never more than two boxes.
              <div className="grid grid-cols-2 gap-1.5">
                <LanguageColumn
                  label="1st"
                  code={language}
                  track={findTrack(tracks, language)}
                  slot={0}
                />
                <LanguageColumn
                  label="2nd"
                  code={language2}
                  track={findTrack(tracks, language2)}
                  slot={1}
                />
              </div>
            ) : (
              <SingleLanguageList tracks={tracks} />
            ))}
        </div>
      )}
    </li>
  );
}

function findTrack(tracks: readonly Track[], code: string): Track | null {
  const wanted = code.toLowerCase();
  return tracks.find((track) => track.code.toLowerCase() === wanted) ?? null;
}

/** One release, one language: the track if the release has it, or a plain "not available". */
function LanguageColumn({
  label,
  code,
  track,
  slot,
}: {
  label: string;
  code: string;
  track: Track | null;
  slot: SlotId;
}) {
  const find = usePanel((s) => s.find);
  const loadTrack = usePanel((s) => s.loadTrack);

  const loading =
    track !== null && find.loading === trackKey(track) && find.loadingSlot === slot;

  return (
    <div className="rounded border border-white/5 bg-black/20 px-1.5 py-1">
      <div
        className="truncate text-[9px] uppercase tracking-wide text-white/35"
        title={languageName(code)}
      >
        {label} · {languageName(code)}
      </div>

      {track ? (
        <>
          <div className="mt-0.5 truncate text-[10px] text-white/70" title={track.name}>
            {track.name}
          </div>
          <div className="mt-1">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => void loadTrack(track, slot)}
              disabled={find.loading !== null}
            >
              {loading ? 'Loading…' : `Load as ${label.toLowerCase()}`}
            </Button>
          </div>
        </>
      ) : (
        <p className="mt-0.5 text-[10px] text-white/25">Not available</p>
      )}
    </div>
  );
}

/** The single-language case: exactly the flat list this tab always had. */
function SingleLanguageList({ tracks }: { tracks: readonly Track[] }) {
  const find = usePanel((s) => s.find);
  const loadTrack = usePanel((s) => s.loadTrack);

  return (
    <>
      {tracks.map((track) => {
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
    </>
  );
}
