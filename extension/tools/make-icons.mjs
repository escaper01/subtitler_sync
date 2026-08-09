/**
 * Generate the toolbar icons.
 *
 *   node tools/make-icons.mjs
 *
 * Draws the mark procedurally — a dark rounded tile with two subtitle lines — and writes
 * `public/icons/icon{16,32,48,128}.png` plus a matching `icon.svg` source.
 *
 * It is a script rather than a checked-in binary so the shape can be nudged and the whole
 * set regenerated consistently. To use your own artwork instead, just replace the PNGs;
 * nothing else reads this file.
 */

import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../public/icons');
const SIZES = [16, 32, 48, 128];

/* ------------------------------------------------------------------- the mark */

const TILE = '#0b1220';
const BORDER = '#ffffff';
const BORDER_ALPHA = 0.16;
const LINE = '#38bdf8';

/** Everything below is in fractions of the icon's size, so one shape serves every size. */
const GEOMETRY = {
  radius: 0.22,
  /**
   * [x0, x1, y0, y1] of each subtitle line. Short line above a long one.
   *
   * The lines are 12% of the icon tall so that at 16px they still land on ~2 device
   * pixels; any thinner and they wash out to a grey smudge in the toolbar.
   */
  lines: [
    [0.26, 0.74, 0.46, 0.58],
    [0.14, 0.86, 0.66, 0.78],
  ],
};

/** 4× supersampling: the corners and the line ends are the whole point of the mark. */
const SS = 4;

function render(size) {
  const n = size * SS;
  const pixels = new Uint8ClampedArray(size * size * 4);
  const tile = hexToRgb(TILE);
  const border = hexToRgb(BORDER);
  const line = hexToRgb(LINE);

  // Border thickness scales with the icon but never falls below a device pixel.
  const stroke = Math.max(1, Math.round(size / 24)) * SS;
  const radius = GEOMETRY.radius * n;

  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;

      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const x = px * SS + sx + 0.5;
          const y = py * SS + sy + 0.5;

          const inTile = insideRoundedRect(x, y, 0, 0, n, n, radius);
          if (!inTile) continue;

          let sr = tile[0];
          let sg = tile[1];
          let sb = tile[2];

          // Inner border, drawn as a ring just inside the tile edge.
          if (!insideRoundedRect(x, y, stroke, stroke, n - stroke, n - stroke, radius - stroke)) {
            sr = mix(sr, border[0], BORDER_ALPHA);
            sg = mix(sg, border[1], BORDER_ALPHA);
            sb = mix(sb, border[2], BORDER_ALPHA);
          }

          for (const [x0, x1, y0, y1] of GEOMETRY.lines) {
            const bx0 = x0 * n;
            const bx1 = x1 * n;
            const by0 = y0 * n;
            const by1 = y1 * n;
            if (insideRoundedRect(x, y, bx0, by0, bx1, by1, (by1 - by0) / 2)) {
              [sr, sg, sb] = line;
            }
          }

          r += sr;
          g += sg;
          b += sb;
          a += 255;
        }
      }

      const samples = SS * SS;
      const coverage = a / (samples * 255);
      const i = (py * size + px) * 4;
      if (coverage > 0) {
        // Un-premultiply: the accumulated colour only covers the samples inside the tile.
        pixels[i] = r / (samples * coverage);
        pixels[i + 1] = g / (samples * coverage);
        pixels[i + 2] = b / (samples * coverage);
      }
      pixels[i + 3] = Math.round(coverage * 255);
    }
  }

  return pixels;
}

/** Signed-distance test for a rounded rectangle, in absolute coordinates. */
function insideRoundedRect(x, y, x0, y0, x1, y1, radius) {
  if (x1 <= x0 || y1 <= y0) return false;
  const r = Math.max(0, Math.min(radius, (x1 - x0) / 2, (y1 - y0) / 2));
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;

  const cx = Math.min(Math.max(x, x0 + r), x1 - r);
  const cy = Math.min(Math.max(y, y0 + r), y1 - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}

function mix(base, over, alpha) {
  return base * (1 - alpha) + over * alpha;
}

function hexToRgb(hex) {
  const value = parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

/* ------------------------------------------------------------------------ png */

function png(size, pixels) {
  const stride = size * 4;
  // One filter byte (0 = none) per scanline, then the raw RGBA row.
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0;
    Buffer.from(pixels.buffer, y * stride, stride).copy(raw, y * (stride + 1) + 1);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([length, body, crc]);
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/* ------------------------------------------------------------------------ svg */

function svg() {
  const lines = GEOMETRY.lines
    .map(([x0, x1, y0, y1]) => {
      const w = ((x1 - x0) * 128).toFixed(1);
      const h = ((y1 - y0) * 128).toFixed(1);
      return `  <rect x="${(x0 * 128).toFixed(1)}" y="${(y0 * 128).toFixed(1)}" width="${w}" height="${h}" rx="${(Number(h) / 2).toFixed(1)}" fill="${LINE}"/>`;
    })
    .join('\n');

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="128" height="128">
  <!-- Source for tools/make-icons.mjs. Editing this file alone changes nothing:
       adjust the script (or replace the PNGs) to change the shipped icons. -->
  <rect width="128" height="128" rx="${(GEOMETRY.radius * 128).toFixed(1)}" fill="${TILE}"/>
  <rect x="2.5" y="2.5" width="123" height="123" rx="${(GEOMETRY.radius * 128 - 2.5).toFixed(1)}" fill="none" stroke="${BORDER}" stroke-opacity="${BORDER_ALPHA}" stroke-width="5"/>
${lines}
</svg>
`;
}

/* ----------------------------------------------------------------------- main */

mkdirSync(OUT_DIR, { recursive: true });

for (const size of SIZES) {
  const file = resolve(OUT_DIR, `icon${size}.png`);
  writeFileSync(file, png(size, render(size)));
  console.log(`wrote ${file}`);
}

writeFileSync(resolve(OUT_DIR, 'icon.svg'), svg());
console.log(`wrote ${resolve(OUT_DIR, 'icon.svg')}`);
