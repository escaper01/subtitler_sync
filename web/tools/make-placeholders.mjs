/**
 * Generate the placeholder screenshots.
 *
 *   node tools/make-placeholders.mjs
 *
 * Writes a labelled 16:10 frame per feature into public/screenshots/. They exist so the
 * pages look deliberate before any real screenshots are taken — replace a file with your
 * own and nothing else changes.
 *
 * Regenerating overwrites everything in that folder, so take screenshots elsewhere first.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '../public/screenshots');

/** Keep in step with lib/features.ts — the file names there are these. */
const SHOTS = [
  ['load-file', 'Loading a subtitle file'],
  ['click-to-sync', 'Click-to-sync'],
  ['drift', 'Drift correction'],
  ['styling', 'Subtitle styling'],
  ['fullscreen', 'Fullscreen'],
  ['sites', 'Site list'],
  ['search', 'Subtitle search'],
  ['releases', 'Results by release'],
];

const W = 800;
const H = 500;

function placeholder(label) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${label} — placeholder">
  <rect width="${W}" height="${H}" fill="#0b1220"/>
  <rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" fill="none" stroke="#22304a"/>

  <!-- A player frame, so the shape reads as a screenshot before one exists. -->
  <rect x="56" y="52" width="${W - 112}" height="${H - 160}" rx="8" fill="#05090f" stroke="#22304a"/>

  <!-- Two subtitle lines, the mark's own motif. -->
  <rect x="${W / 2 - 108}" y="${H - 168}" width="216" height="12" rx="6" fill="#38bdf8" opacity="0.85"/>
  <rect x="${W / 2 - 156}" y="${H - 146}" width="312" height="12" rx="6" fill="#38bdf8" opacity="0.5"/>

  <text x="${W / 2}" y="${H - 60}" text-anchor="middle" font-family="IBM Plex Mono, ui-monospace, monospace" font-size="19" fill="#e8eef7">${label}</text>
  <text x="${W / 2}" y="${H - 34}" text-anchor="middle" font-family="IBM Plex Mono, ui-monospace, monospace" font-size="13" fill="#93a3bc">replace public/screenshots/${label.toLowerCase().replace(/[^a-z]+/g, '-')}</text>
</svg>
`;
}

mkdirSync(OUT, { recursive: true });

for (const [name, label] of SHOTS) {
  const file = resolve(OUT, `${name}.svg`);
  writeFileSync(file, placeholder(label));
  console.log(`wrote ${file}`);
}
