import { describe, expect, it } from 'vitest';
import type { Episode } from '@/lib/tv';
import {
  episodeAt,
  episodeQuery,
  firstEpisode,
  forget,
  groupSeasons,
  inOrder,
  nextEpisode,
  pad2,
  previousEpisode,
  remember,
} from '@/lib/tv';

/**
 * The season boundary is the whole reason this logic exists as data rather than
 * arithmetic. `episode + 1` is right until the season ends, and then it is wrong in a way
 * that looks like a search that found nothing.
 */

function ep(season: number, number: number, name = ''): Episode {
  return { season, number, name, airdate: null };
}

/** Season 1 of 7, season 2 of 13 — deliberately unequal, like Breaking Bad's. */
const SHOW: Episode[] = [
  ...Array.from({ length: 7 }, (_, i) => ep(1, i + 1, `s1e${i + 1}`)),
  ...Array.from({ length: 13 }, (_, i) => ep(2, i + 1, `s2e${i + 1}`)),
];

describe('groupSeasons', () => {
  it('groups a flat list and counts the real episodes', () => {
    const seasons = groupSeasons(SHOW);

    expect(seasons.map((s) => s.number)).toEqual([1, 2]);
    expect(seasons[0]?.episodes).toHaveLength(7);
    expect(seasons[1]?.episodes).toHaveLength(13);
  });

  it('sorts seasons and episodes even when the API returns them jumbled', () => {
    const seasons = groupSeasons([ep(2, 2), ep(1, 3), ep(2, 1), ep(1, 1), ep(1, 2)]);

    expect(seasons.map((s) => s.number)).toEqual([1, 2]);
    expect(seasons[0]?.episodes.map((e) => e.number)).toEqual([1, 2, 3]);
    expect(seasons[1]?.episodes.map((e) => e.number)).toEqual([1, 2]);
  });

  it('drops specials, which cannot be named as sNNeNN', () => {
    // TVmaze puts specials in season 0, and gives some episodes a null number.
    const seasons = groupSeasons([
      ep(0, 1, 'a special'),
      ep(1, 1),
      { season: 1, number: null as unknown as number, name: 'unaired', airdate: null },
    ]);

    expect(seasons).toHaveLength(1);
    expect(seasons[0]?.number).toBe(1);
    expect(seasons[0]?.episodes).toHaveLength(1);
  });

  it('handles an empty list without inventing a season', () => {
    expect(groupSeasons([])).toEqual([]);
  });
});

describe('walking the episode list', () => {
  const seasons = groupSeasons(SHOW);

  it('steps within a season', () => {
    expect(nextEpisode(seasons, { season: 1, episode: 3 })).toEqual({ season: 1, episode: 4 });
  });

  it('crosses INTO the next season at the end of one', () => {
    // The case the whole feature turns on: season 1 has 7 episodes, so e8 does not exist.
    expect(nextEpisode(seasons, { season: 1, episode: 7 })).toEqual({ season: 2, episode: 1 });
  });

  it('crosses BACK at the start of a season, to the right episode number', () => {
    // Not e1, and not a guess — season 1 ended at 7.
    expect(previousEpisode(seasons, { season: 2, episode: 1 })).toEqual({
      season: 1,
      episode: 7,
    });
  });

  it('stops at the end of the series rather than wrapping', () => {
    expect(nextEpisode(seasons, { season: 2, episode: 13 })).toBeNull();
  });

  it('stops at the start of the series', () => {
    expect(previousEpisode(seasons, { season: 1, episode: 1 })).toBeNull();
  });

  it('answers null for a position that is not in the list, rather than guessing', () => {
    // A remembered position can outlive a re-numbered season.
    expect(nextEpisode(seasons, { season: 1, episode: 99 })).toBeNull();
    expect(nextEpisode(seasons, { season: 9, episode: 1 })).toBeNull();
  });

  it('walks a gap in the numbering without skipping past it', () => {
    // Some shows genuinely list e1, e2, e4 — a withdrawn episode. Adding one would land
    // on e3, which does not exist.
    const patchy = groupSeasons([ep(1, 1), ep(1, 2), ep(1, 4)]);
    expect(nextEpisode(patchy, { season: 1, episode: 2 })).toEqual({ season: 1, episode: 4 });
  });

  it('firstEpisode is the start of the earliest season', () => {
    expect(firstEpisode(seasons)).toEqual({ season: 1, episode: 1 });
    expect(firstEpisode([])).toBeNull();
  });

  it('inOrder is the flat broadcast sequence', () => {
    expect(inOrder(seasons)).toHaveLength(20);
    expect(inOrder(seasons)[6]).toEqual({ season: 1, episode: 7 });
    expect(inOrder(seasons)[7]).toEqual({ season: 2, episode: 1 });
  });

  it('finds an episode for its tooltip', () => {
    expect(episodeAt(seasons, { season: 2, episode: 3 })?.name).toBe('s2e3');
    expect(episodeAt(seasons, { season: 5, episode: 1 })).toBeNull();
  });
});

describe('episodeQuery', () => {
  it('formats the way subtitlecat names its releases', () => {
    expect(episodeQuery('Person of Interest', { season: 1, episode: 4 })).toBe(
      'Person of Interest s01e04',
    );
  });

  it('pads to two digits and stops padding above nine', () => {
    expect(pad2(4)).toBe('04');
    expect(pad2(10)).toBe('10');
    expect(pad2(104)).toBe('104');
  });

  it('does not pad a three-digit episode into nonsense', () => {
    expect(episodeQuery('Show', { season: 12, episode: 121 })).toBe('Show s12e121');
  });

  it('trims the show name, which arrives from a text box', () => {
    expect(episodeQuery('  The Wire  ', { season: 2, episode: 1 })).toBe('The Wire s02e01');
  });

  it('leaves punctuation in the name alone', () => {
    // Renames here would stop matching the release names, which carry the punctuation.
    expect(episodeQuery("Marvel's Daredevil", { season: 1, episode: 1 })).toBe(
      "Marvel's Daredevil s01e01",
    );
  });
});

describe('remembering where you got to', () => {
  it('puts the most recent first', () => {
    let list = remember([], { showId: 1, name: 'A', season: 1, episode: 1 }, 100);
    list = remember(list, { showId: 2, name: 'B', season: 1, episode: 1 }, 200);

    expect(list.map((s) => s.showId)).toEqual([2, 1]);
  });

  it('replaces a show rather than adding it twice', () => {
    let list = remember([], { showId: 1, name: 'A', season: 1, episode: 1 }, 100);
    list = remember(list, { showId: 1, name: 'A', season: 1, episode: 2 }, 200);

    expect(list).toHaveLength(1);
    expect(list[0]?.episode).toBe(2);
  });

  it('caps the list, dropping the least recent', () => {
    let list: ReturnType<typeof remember> = [];
    for (let i = 1; i <= 12; i += 1) {
      list = remember(list, { showId: i, name: `S${i}`, season: 1, episode: 1 }, i);
    }

    expect(list).toHaveLength(8);
    expect(list[0]?.showId).toBe(12);
    expect(list.some((s) => s.showId === 1)).toBe(false);
  });

  it('forgets one show and leaves the rest', () => {
    let list = remember([], { showId: 1, name: 'A', season: 1, episode: 1 }, 1);
    list = remember(list, { showId: 2, name: 'B', season: 1, episode: 1 }, 2);

    expect(forget(list, 1).map((s) => s.showId)).toEqual([2]);
  });
});
