/**
 * Regenerates the sample subtitle fixtures.  Run with:  node test/generate-samples.mjs
 *
 * Every cue announces the timecode it is supposed to appear at, so that when it is played
 * against the harness clip — which has a clock burned into the picture — a timing error is
 * something you can see rather than something you have to judge.
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

const pad = (n, width = 2) => String(n).padStart(width, '0');

const stamp = (seconds) =>
  `${pad(Math.floor(seconds / 3600))}:${pad(Math.floor((seconds % 3600) / 60))}:` +
  `${pad(Math.floor(seconds % 60))},${pad(Math.round((seconds % 1) * 1000), 3)}`;

/**
 * @param scale How much faster the subtitle timebase runs than the video's. 1 is correct;
 *   25/23.976 reproduces the classic framerate mismatch the two-point fit exists to solve.
 */
function build(scale) {
  const lines = [];

  for (let i = 0; i < 20; i++) {
    const start = 2 + i * 5;
    const end = start + 3.5;
    const label = `${pad(Math.floor(start / 60))}:${pad(start % 60)}`;

    lines.push(
      `${i + 1}`,
      `${stamp(start / scale)} --> ${stamp(end / scale)}`,
      `Cue ${i + 1} — should appear at ${label}`,
    );
    // Give every third cue a second row, so line spacing and wrapping get exercised too.
    if (i % 3 === 0) lines.push('second line, to check line spacing');
    lines.push('');
  }

  return lines.join('\n');
}

writeFileSync(join(here, 'sample.srt'), build(1), 'utf8');
writeFileSync(join(here, 'sample-drift.srt'), build(25 / 23.976), 'utf8');

console.log('wrote test/sample.srt and test/sample-drift.srt');
