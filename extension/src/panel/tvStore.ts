import { create } from 'zustand';
import type { Position, RememberedShow, Season, Show } from '@/lib/tv';
import {
  episodeQuery,
  firstEpisode,
  forget as forgetShow,
  nextEpisode,
  previousEpisode,
  remember,
} from '@/lib/tv';
import type { TvResult } from '@/lib/tvmaze';
import { askBackground } from '@/lib/messaging';
import { loadShows, saveShows } from '@/lib/searchStorage';
import { usePanel } from '@/panel/store';
import { log } from '@/lib/log';

/**
 * Browsing a series, so an episode search is a click rather than typing
 * "Person of Interest s01e04" for the fourth time this evening.
 *
 * A **separate store** from `usePanel`, deliberately. It owns none of the subtitle state
 * and the subtitle state owns none of it — the only thing it does to the panel is fill in
 * the search box and press Search, which it does through `usePanel.getState()`. That seam
 * is also what makes it a clean deletion for the search-free build, where there is no
 * search box to fill in.
 */

export interface TvState {
  /** The show-name box, which is not the subtitle search box. */
  query: string;
  status: 'idle' | 'searching' | 'done';
  error: string | null;
  results: Show[];

  /** The show currently opened, if any. */
  show: Show | null;
  seasons: Season[];
  loadingSeasons: boolean;
  /** Which season's episodes are listed. */
  season: number | null;
  /** The episode last searched for. What `next` steps from. */
  position: Position | null;

  /** Most recent first. Restored on open, so the common case needs no typing at all. */
  recent: RememberedShow[];

  init: () => Promise<void>;
  setQuery: (query: string) => void;
  search: () => Promise<void>;
  openShow: (show: Show, at?: Position) => Promise<void>;
  openRecent: (entry: RememberedShow) => Promise<void>;
  setSeason: (season: number) => void;
  pickEpisode: (at: Position) => void;
  step: (direction: 1 | -1) => void;
  dropRecent: (showId: number) => void;
  close: () => void;
}

const EMPTY = {
  query: '',
  status: 'idle',
  error: null,
  results: [],
  show: null,
  seasons: [],
  loadingSeasons: false,
  season: null,
  position: null,
} satisfies Omit<TvState, 'recent' | keyof TvActions>;

type TvActions = Pick<
  TvState,
  | 'init'
  | 'setQuery'
  | 'search'
  | 'openShow'
  | 'openRecent'
  | 'setSeason'
  | 'pickEpisode'
  | 'step'
  | 'dropRecent'
  | 'close'
>;

export const useTv = create<TvState>((set, get) => ({
  ...EMPTY,
  recent: [],

  async init() {
    const recent = await loadShows();
    set({ recent });

    // Reopen whatever was last watched, at the episode it was left on. This is the whole
    // feature: the panel comes up already pointed at the next thing you want.
    const last = recent[0];
    if (last) {
      void get().openRecent(last);
    }
  },

  setQuery(query) {
    set({ query, error: null });
  },

  async search() {
    const query = get().query.trim();
    if (query.length < 2 || get().status === 'searching') return;

    set({ status: 'searching', error: null, results: [] });

    const result = await askBackground<TvResult<Show[]>>({ kind: 'tv:search', query });

    if (!result || !result.ok) {
      set({ status: 'done', error: result?.error ?? 'Could not reach TVmaze.', results: [] });
      return;
    }

    set({ status: 'done', results: result.data, error: null });
  },

  async openShow(show, at) {
    set({ show, loadingSeasons: true, error: null, seasons: [], season: null, results: [] });

    const result = await askBackground<TvResult<Season[]>>({
      kind: 'tv:seasons',
      showId: show.id,
    });

    if (!result || !result.ok) {
      set({ loadingSeasons: false, error: result?.error ?? 'Could not load the episodes.' });
      return;
    }

    const seasons = result.data;
    // Resume where they left off; otherwise start at the beginning. A remembered position
    // that no longer exists — an episode withdrawn, a re-numbered season — falls back
    // rather than leaving nothing selected.
    const resume = at && seasons.some((s) => s.number === at.season) ? at : firstEpisode(seasons);

    set({
      seasons,
      loadingSeasons: false,
      season: resume?.season ?? seasons[0]?.number ?? null,
      position: resume ?? null,
      error: seasons.length === 0 ? 'TVmaze lists no episodes for this one.' : null,
    });

    log.info('tv', 'opened show', { name: show.name, seasons: seasons.length });
  },

  async openRecent(entry) {
    await get().openShow(
      // A remembered row holds only what is needed to search again. The rest of the show's
      // detail is cosmetic and is refetched if the user searches for it by name.
      { id: entry.showId, name: entry.name, year: null, status: null, network: null },
      { season: entry.season, episode: entry.episode },
    );
  },

  setSeason(season) {
    set({ season });
  },

  /**
   * Search for one episode, and remember that this is where we got to.
   *
   * The position advances **here**, when a search is run — not when a subtitle is loaded.
   * Finding a track that actually fits often takes two or three attempts on the same
   * episode, and a counter that ran ahead of the user would be worse than one they have to
   * press once.
   */
  pickEpisode(at) {
    const show = get().show;
    if (!show) return;

    set({ position: at, season: at.season });

    const recent = remember(get().recent, {
      showId: show.id,
      name: show.name,
      season: at.season,
      episode: at.episode,
    });
    set({ recent });
    void saveShows(recent);

    const panel = usePanel.getState();
    panel.setQuery(episodeQuery(show.name, at));
    void panel.runSearch();
  },

  step(direction) {
    const { seasons, position } = get();
    if (!position) return;

    const target =
      direction === 1 ? nextEpisode(seasons, position) : previousEpisode(seasons, position);
    if (!target) return;

    get().pickEpisode(target);
  },

  dropRecent(showId) {
    const recent = forgetShow(get().recent, showId);
    set({ recent });
    void saveShows(recent);
  },

  close() {
    set({ ...EMPTY, query: get().query });
  },
}));
