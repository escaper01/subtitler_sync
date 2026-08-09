/**
 * What the extension does, in one place.
 *
 * The home page, the store listing and the how-to-use page all describe the same product,
 * and they drifted apart the last time they were written separately.
 *
 * `image` points at a placeholder in `public/screenshots/`. Replace the file with a real
 * screenshot and nothing else needs touching — keep the name, or update it here. Images are
 * 16:10; anything else will letterbox inside the frame.
 */

export interface Feature {
  name: string;
  summary: string;
  detail: string;
  image: string;
  alt: string;
}

export const FREE_FEATURES: Feature[] = [
  {
    name: 'Load your own subtitles',
    summary: 'Any .srt or .vtt file, dropped straight onto the video.',
    detail:
      'Pick a file and it appears over the player. Encodings that usually turn into question marks — Windows-1256, Latin-1 — are detected and decoded properly.',
    image: '/screenshots/load-file.svg',
    alt: 'The panel open over a video with a subtitle file loaded',
  },
  {
    name: 'Fix the timing with a click',
    summary: 'Click the line being spoken now. The whole track snaps to it.',
    detail:
      'No typing offsets and guessing. You hear a line, you click it in the list, and every cue moves by the same amount.',
    image: '/screenshots/click-to-sync.svg',
    alt: 'The sync tab, with a cue being clicked to realign the track',
  },
  {
    name: 'Correct subtitles that drift',
    summary: 'Right at the start, ten seconds late by the end — fixed in two clicks.',
    detail:
      'That is almost always a framerate mismatch: a 25 fps subtitle against a 23.976 fps video slips about 4%. Mark one line near the beginning and one near the end and the rate is fitted for you.',
    image: '/screenshots/drift.svg',
    alt: 'Two anchors set at either end of a film to correct progressive drift',
  },
  {
    name: 'Make them readable',
    summary: 'Font, size, colour, outline, shadow, background, position.',
    detail:
      'Set it once and it applies everywhere. Sizes are a share of the video height, so text stays proportionate when you go fullscreen.',
    image: '/screenshots/styling.svg',
    alt: 'The style tab with typography and background controls',
  },
  {
    name: 'Survives fullscreen',
    summary: 'The subtitles and the panel stay where they should be.',
    detail:
      'Most overlays vanish the moment the player takes over the screen. This one moves with it — which is exactly when you need the sync tool.',
    image: '/screenshots/fullscreen.svg',
    alt: 'Subtitles and the panel visible over a fullscreen video',
  },
  {
    name: 'Runs only where you allow it',
    summary: 'A site list you control. Nowhere else, ever.',
    detail:
      'Nothing appears on a site you have not enabled. Turn one on from the toolbar and it takes effect immediately, with no reload.',
    image: '/screenshots/sites.svg',
    alt: 'The site list, with the current domain being enabled',
  },
];

export const SEARCH_FEATURES: Feature[] = [
  {
    name: 'Find subtitles by title',
    summary: 'Type a film or series name without leaving the page.',
    detail:
      'The box is filled in from the page title, so usually you press Search. Results come back five at a time.',
    image: '/screenshots/search.svg',
    alt: 'The find tab with search results for a film',
  },
  {
    name: 'Matched to your release',
    summary: 'Results are named after the video they were timed against.',
    detail:
      'Pick the one matching what you are watching and it often needs no syncing at all. Download counts and the original language are shown, so a human translation is easy to tell from a machine one.',
    image: '/screenshots/releases.svg',
    alt: 'Search results listed by release name with download counts',
  },
];
