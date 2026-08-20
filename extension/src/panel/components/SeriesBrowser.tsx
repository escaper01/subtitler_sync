import { useEffect, useState } from 'react';
import type { Position, Season, Show } from '@/lib/tv';
import { episodeAt, nextEpisode, previousEpisode } from '@/lib/tv';
import { useTv } from '@/panel/tvStore';
import { Button, TextInput } from '@/panel/components/ui';

/**
 * Browse a series instead of typing "Person of Interest s01e04" every time.
 *
 * A collapsible section at the top of the Find tab, not a sixth tab: the panel is 340px
 * wide and clipped to the player's iframe, and five tabs is already the practical limit.
 *
 * **No poster images.** TVmaze serves them from static.tvmaze.com, and this renders inside
 * a shadow root in *somebody else's document* — images in a shadow root still obey the host
 * page's `img-src`, so posters would load on some sites and silently break on others, which
 * reads as a bug. Name, year, network and status are enough to pick the right show.
 */
export function SeriesBrowser() {
  const [open, setOpen] = useState(false);
  const init = useTv((s) => s.init);
  const recent = useTv((s) => s.recent);
  const show = useTv((s) => s.show);

  useEffect(() => {
    void init();
  }, [init]);

  // Opens itself when there is somewhere to resume from — that is the entire point of
  // remembering, and needing a click to reveal it would undo it.
  useEffect(() => {
    if (recent.length > 0) setOpen(true);
  }, [recent.length]);

  return (
    <div className="rounded border border-white/10 bg-black/20">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-1.5 px-2 py-1.5 text-left hover:bg-white/5"
      >
        <span className="text-[9px] text-white/35">{open ? '▾' : '▸'}</span>
        <span className="text-[11px] font-medium text-white/75">Series</span>
        {!open && show && (
          <span className="ml-auto max-w-40 truncate text-[10px] text-white/35">{show.name}</span>
        )}
        {!open && !show && (
          <span className="ml-auto text-[10px] text-white/30">pick a season and episode</span>
        )}
      </button>

      {open && (
        <div className="space-y-2 border-t border-white/10 px-2 py-2">
          <RecentShows />
          <ShowSearch />
          <SeasonPicker />
          <EpisodePicker />
          <Stepper />
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------- recents */

function RecentShows() {
  const recent = useTv((s) => s.recent);
  const show = useTv((s) => s.show);
  const openRecent = useTv((s) => s.openRecent);
  const dropRecent = useTv((s) => s.dropRecent);

  if (recent.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1">
      {recent.map((entry) => {
        const active = show?.id === entry.showId;
        return (
          <span
            key={entry.showId}
            className={`group inline-flex items-center rounded border text-[10px] ${
              active
                ? 'border-sky-400/40 bg-sky-500/15 text-sky-100'
                : 'border-white/10 text-white/50 hover:border-white/25'
            }`}
          >
            <button
              type="button"
              onClick={() => void openRecent(entry)}
              className="max-w-36 truncate py-0.5 pl-1.5"
              title={`Resume at s${entry.season}e${entry.episode}`}
            >
              {entry.name}
            </button>
            <button
              type="button"
              onClick={() => dropRecent(entry.showId)}
              aria-label={`Forget ${entry.name}`}
              className="px-1 py-0.5 text-white/25 hover:text-white/70"
            >
              ×
            </button>
          </span>
        );
      })}
    </div>
  );
}

/* --------------------------------------------------------------- show search */

function ShowSearch() {
  const query = useTv((s) => s.query);
  const setQuery = useTv((s) => s.setQuery);
  const search = useTv((s) => s.search);
  const status = useTv((s) => s.status);
  const results = useTv((s) => s.results);
  const error = useTv((s) => s.error);
  const openShow = useTv((s) => s.openShow);
  const show = useTv((s) => s.show);

  return (
    <div className="space-y-1.5">
      <div className="flex gap-1.5">
        <TextInput
          value={query}
          onChange={setQuery}
          onEnter={() => void search()}
          placeholder="Series name"
          maxLength={80}
          className="min-w-0 flex-1"
        />
        <Button
          size="sm"
          onClick={() => void search()}
          disabled={query.trim().length < 2 || status === 'searching'}
        >
          {status === 'searching' ? '…' : 'Find'}
        </Button>
      </div>

      {error && <p className="text-[10px] text-red-300">{error}</p>}

      {results.length > 0 && (
        <ul className="max-h-32 space-y-0.5 overflow-auto">
          {results.map((hit) => (
            <li key={hit.id}>
              <button
                type="button"
                onClick={() => void openShow(hit)}
                className={`w-full rounded px-1.5 py-1 text-left hover:bg-white/5 ${
                  show?.id === hit.id ? 'bg-sky-500/10' : ''
                }`}
              >
                <span className="block truncate text-[11px] text-white/85">{hit.name}</span>
                <span className="mt-px block text-[9px] text-white/35">
                  {describe(hit)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {status === 'done' && results.length === 0 && !error && query.trim().length >= 2 && (
        <p className="text-[10px] text-white/35">
          No series by that name. TVmaze covers television only — for a film, just type the
          title below.
        </p>
      )}
    </div>
  );
}

function describe(show: Show): string {
  return [show.year, show.network, show.status].filter(Boolean).join(' · ');
}

/* ------------------------------------------------------------------- seasons */

function SeasonPicker() {
  const seasons = useTv((s) => s.seasons);
  const season = useTv((s) => s.season);
  const setSeason = useTv((s) => s.setSeason);
  const loading = useTv((s) => s.loadingSeasons);

  if (loading) return <p className="text-[10px] text-white/40">Loading episodes…</p>;
  if (seasons.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1">
      {seasons.map((entry: Season) => (
        <button
          key={entry.number}
          type="button"
          onClick={() => setSeason(entry.number)}
          className={`rounded px-1.5 py-0.5 text-[10px] tabular-nums transition-colors ${
            season === entry.number
              ? 'bg-sky-500/20 text-sky-200'
              : 'text-white/45 hover:bg-white/5 hover:text-white/70'
          }`}
          // The real count, derived from the episode list — see groupSeasons for why the
          // seasons endpoint's own number cannot be trusted for a show still airing.
          title={`${entry.episodes.length} episodes`}
        >
          S{entry.number}
          <span className="ml-1 text-white/25">{entry.episodes.length}</span>
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ episodes */

function EpisodePicker() {
  const seasons = useTv((s) => s.seasons);
  const season = useTv((s) => s.season);
  const position = useTv((s) => s.position);
  const pickEpisode = useTv((s) => s.pickEpisode);

  const current = seasons.find((s) => s.number === season);
  if (!current) return null;

  return (
    <div className="flex max-h-24 flex-wrap gap-1 overflow-auto">
      {current.episodes.map((episode) => {
        const selected = position?.season === season && position.episode === episode.number;
        return (
          <button
            key={episode.number}
            type="button"
            onClick={() => pickEpisode({ season: current.number, episode: episode.number })}
            title={[episode.name, episode.airdate].filter(Boolean).join(' — ')}
            className={`rounded px-1.5 py-0.5 text-[10px] tabular-nums transition-colors ${
              selected
                ? 'bg-sky-500 text-white'
                : 'bg-white/5 text-white/50 hover:bg-white/10 hover:text-white/80'
            }`}
          >
            E{episode.number}
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------- stepper */

/**
 * Previous / next, which is what removes the typing entirely on a binge.
 *
 * Both walk the real episode list rather than adding one, so the end of a season crosses
 * into the next correctly whether it had 7 episodes or 23.
 */
function Stepper() {
  const seasons = useTv((s) => s.seasons);
  const position = useTv((s) => s.position);
  const show = useTv((s) => s.show);
  const step = useTv((s) => s.step);
  const pickEpisode = useTv((s) => s.pickEpisode);

  if (!show || !position || seasons.length === 0) return null;

  const previous = previousEpisode(seasons, position);
  const next = nextEpisode(seasons, position);
  const episode = episodeAt(seasons, position);

  return (
    <div className="flex items-center gap-1.5 border-t border-white/10 pt-2">
      <Button size="sm" onClick={() => step(-1)} disabled={!previous} title="Previous episode">
        ‹
      </Button>

      <button
        type="button"
        onClick={() => pickEpisode(position)}
        className="min-w-0 flex-1 rounded px-1 text-left hover:bg-white/5"
        title={episode?.name ? `${episode.name} — search again` : 'Search again'}
      >
        <span className="block truncate text-[10px] text-white/70">
          S{position.season}E{position.episode}
          {episode?.name && <span className="text-white/35"> · {episode.name}</span>}
        </span>
      </button>

      <Button
        size="sm"
        variant="primary"
        onClick={() => step(1)}
        disabled={!next}
        title={next ? `Search for S${next.season}E${next.episode}` : 'End of the series'}
      >
        Next ›
      </Button>
    </div>
  );
}

/** Re-exported so the Find tab does not need to know about `Position`. */
export type { Position };
