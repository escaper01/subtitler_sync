/**
 * Series, seasons and episodes — the pure half.
 *
 * No `fetch`, no `chrome.*`. The network half is `lib/tvmaze.ts`, which runs in the
 * service worker only; this is the part that is worth testing, because "what comes after
 * the last episode of season 1" is exactly the sort of arithmetic that looks right and
 * is wrong at the boundary.
 */

/** One show, as much of it as the panel shows. */
export interface Show {
  id: number;
  name: string;
  /** Four-digit year, or null when the show never aired. */
  year: string | null;
  /** "Running" | "Ended" | ... — TVmaze's own word for it. */
  status: string | null;
  /** The network or streaming service, whichever it had. */
  network: string | null;
}

/** One episode. */
export interface Episode {
  season: number;
  number: number;
  name: string;
  airdate: string | null;
}

/** One season, derived from the episode list rather than asked for separately. */
export interface Season {
  number: number;
  episodes: Episode[];
}

/** Where someone got to in a series. */
export interface Position {
  season: number;
  episode: number;
}

/**
 * Group a flat episode list into seasons.
 *
 * **This is why the episode list is fetched instead of `/shows/:id/seasons`.** That
 * endpoint reports `episodeOrder`, which is null for a season still airing and is the
 * *ordered* count rather than the number of episodes actually listed — so a currently
 * airing show, which is exactly the kind somebody is watching, shows a blank or a wrong
 * number. Counting the real episodes cannot be wrong in that way, and it costs one request
 * rather than two.
 *
 * Specials are dropped. TVmaze gives them `season: 0`, or a null `number`, and they are not
 * something you can name in a search query as `s00e01` and expect a subtitle for.
 */
export function groupSeasons(episodes: readonly Episode[]): Season[] {
  const bySeason = new Map<number, Episode[]>();

  for (const episode of episodes) {
    if (!Number.isInteger(episode.season) || episode.season < 1) continue;
    if (!Number.isInteger(episode.number) || episode.number < 1) continue;

    const list = bySeason.get(episode.season);
    if (list) list.push(episode);
    else bySeason.set(episode.season, [episode]);
  }

  return [...bySeason.entries()]
    .sort(([a], [b]) => a - b)
    .map(([number, list]) => ({
      number,
      episodes: [...list].sort((a, b) => a.number - b.number),
    }));
}

/** Flatten seasons back into broadcast order — the sequence next/previous walk. */
export function inOrder(seasons: readonly Season[]): Position[] {
  return seasons.flatMap((season) =>
    season.episodes.map((episode) => ({ season: season.number, episode: episode.number })),
  );
}

function indexOf(order: readonly Position[], at: Position): number {
  return order.findIndex((p) => p.season === at.season && p.episode === at.episode);
}

/**
 * The episode after this one, or null at the end of the series.
 *
 * Walks the real list rather than incrementing a number. That is the whole reason the
 * episode list is held: season 1 of one show ends at 7 and of another at 23, so
 * `episode + 1` is right until it silently is not, and the failure looks like a search
 * that found nothing rather than like a bug.
 *
 * A position that is not in the list — the show was re-fetched and an episode withdrawn,
 * or the user typed something — answers null rather than guessing.
 */
export function nextEpisode(seasons: readonly Season[], at: Position): Position | null {
  const order = inOrder(seasons);
  const index = indexOf(order, at);
  if (index === -1) return null;
  return order[index + 1] ?? null;
}

/** The episode before this one, or null at the start of the series. */
export function previousEpisode(seasons: readonly Season[], at: Position): Position | null {
  const order = inOrder(seasons);
  const index = indexOf(order, at);
  if (index <= 0) return null;
  return order[index - 1] ?? null;
}

/** The first episode of the series, for a show with no remembered position. */
export function firstEpisode(seasons: readonly Season[]): Position | null {
  return inOrder(seasons)[0] ?? null;
}

/** Zero-padded to at least two digits: 4 → "04", 104 → "104". */
export function pad2(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}

/**
 * The search query for one episode.
 *
 * `s01e04`, lowercase, zero-padded — which is how release names on subtitlecat are
 * written, and those names are what the search is matched against. `1x04` and
 * "Season 1 Episode 4" both exist in the wild but are far rarer.
 */
export function episodeQuery(showName: string, at: Position): string {
  return `${showName.trim()} s${pad2(at.season)}e${pad2(at.episode)}`;
}

/** Find an episode's title, for a tooltip. */
export function episodeAt(seasons: readonly Season[], at: Position): Episode | null {
  const season = seasons.find((s) => s.number === at.season);
  return season?.episodes.find((e) => e.number === at.episode) ?? null;
}

/* --------------------------------------------------------------- remembered */

/**
 * A show the user has searched for, and where they got to.
 *
 * The point of the whole feature: typing "Person of Interest s01e04" once and then never
 * typing it again.
 */
export interface RememberedShow {
  showId: number;
  name: string;
  season: number;
  episode: number;
  lastUsedAt: number;
}

/** How many shows to keep. Enough for what someone is watching, not a library. */
export const MAX_REMEMBERED_SHOWS = 8;

/**
 * Record where someone got to, most-recent first.
 *
 * Replaces the show's existing entry rather than adding a second, so the list is one row
 * per show and re-watching does not push everything else out.
 */
export function remember(
  list: readonly RememberedShow[],
  entry: Omit<RememberedShow, 'lastUsedAt'>,
  now = Date.now(),
): RememberedShow[] {
  const rest = list.filter((show) => show.showId !== entry.showId);
  return [{ ...entry, lastUsedAt: now }, ...rest].slice(0, MAX_REMEMBERED_SHOWS);
}

export function forget(list: readonly RememberedShow[], showId: number): RememberedShow[] {
  return list.filter((show) => show.showId !== showId);
}
