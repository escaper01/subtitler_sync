import type { Cue, SubtitleFormat, SubtitleTrack } from '@/types';

/**
 * SRT and WebVTT parsing.
 *
 * Subtitle files in the wild are messy: missing index lines, `.` instead of `,` in
 * timestamps, stray positioning data after the arrow, legacy encodings, cues out of order.
 * The parser is deliberately tolerant — it collects warnings rather than refusing a file,
 * because a track that renders with three odd cues is far more useful than an error.
 */

const MAX_WARNINGS = 25;

/* -------------------------------------------------------------------- decoding */

/**
 * Decode subtitle bytes to text.
 *
 * Most files are UTF-8, but plenty of older SRTs are Windows-1252 or Latin-1, where
 * accented characters would otherwise come out as replacement characters. Strict UTF-8
 * decoding tells us which case we're in.
 */
export function decodeSubtitleBytes(buffer: ArrayBuffer): { text: string; encoding: string } {
  const bytes = new Uint8Array(buffer);

  // Byte-order marks are unambiguous, so trust them first.
  if (bytes.length >= 2) {
    if (bytes[0] === 0xff && bytes[1] === 0xfe) {
      return { text: new TextDecoder('utf-16le').decode(bytes), encoding: 'utf-16le' };
    }
    if (bytes[0] === 0xfe && bytes[1] === 0xff) {
      return { text: new TextDecoder('utf-16be').decode(bytes), encoding: 'utf-16be' };
    }
  }

  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return { text: stripBom(text), encoding: 'utf-8' };
  } catch {
    // Not valid UTF-8. Windows-1252 is the overwhelmingly common alternative and, being
    // single-byte, never fails — so this is the end of the line, not a guess we can refine.
    const text = new TextDecoder('windows-1252').decode(bytes);
    return { text: stripBom(text), encoding: 'windows-1252' };
  }
}

function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/* --------------------------------------------------------------------- sniffing */

export function sniffFormat(text: string, filename: string): SubtitleFormat {
  if (/^\s*WEBVTT/.test(text)) return 'vtt';
  if (/\.vtt$/i.test(filename)) return 'vtt';
  return 'srt';
}

/* ------------------------------------------------------------------ timestamps */

/** `hh:mm:ss,mmm` (SRT) or `[hh:]mm:ss.mmm` (VTT), tolerating either separator. */
const TIMESTAMP = /^(?:(\d+):)?(\d{1,3}):(\d{1,2})[.,](\d{1,3})$/;

export function parseTimestamp(raw: string): number | null {
  const match = TIMESTAMP.exec(raw.trim());
  if (!match) return null;

  const [, hours, minutes, seconds, millis] = match;
  if (minutes === undefined || seconds === undefined || millis === undefined) return null;

  return (
    (hours ? Number(hours) * 3600 : 0) +
    Number(minutes) * 60 +
    Number(seconds) +
    Number(millis.padEnd(3, '0')) / 1000
  );
}

export function formatTimestamp(seconds: number): string {
  const sign = seconds < 0 ? '-' : '';
  const total = Math.abs(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = Math.floor(total % 60);
  const ms = Math.round((total % 1) * 1000);
  const pad = (n: number, width = 2) => String(n).padStart(width, '0');
  return `${sign}${pad(h)}:${pad(m)}:${pad(s)}.${pad(ms, 3)}`;
}

/** Split a `00:00:01,000 --> 00:00:04,000 line:90%` line into its two times. */
function parseTimingLine(line: string): { start: number; end: number } | null {
  const parts = line.split('-->');
  if (parts.length < 2) return null;

  const start = parseTimestamp(parts[0] ?? '');
  // Anything after the end timestamp is positioning/alignment data we don't support.
  const end = parseTimestamp((parts[1] ?? '').trim().split(/\s+/)[0] ?? '');

  if (start === null || end === null) return null;
  return { start, end };
}

/* ------------------------------------------------------------------ text cleanup */

/**
 * Tags we understand well enough to drop. Deliberately not "strip everything in angle
 * brackets" — subtitles legitimately contain things like `<<` or `a < b`.
 */
const MARKUP = /<\/?(?:i|b|u|s|em|strong|font|ruby|rt|v|c|lang|br)(?:\s[^>]*)?\/?>/gi;
/** ASS/SSA override blocks that sometimes survive a conversion to SRT, e.g. `{\an8}`. */
const ASS_TAGS = /\{\\[^}]*\}/g;

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

function decodeEntities(text: string): string {
  return text.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (whole, body: string) => {
    if (body.startsWith('#')) {
      const code = body[1]?.toLowerCase() === 'x' ? parseInt(body.slice(2), 16) : Number(body.slice(1));
      return Number.isFinite(code) && code > 0 ? String.fromCodePoint(code) : whole;
    }
    return ENTITIES[body.toLowerCase()] ?? whole;
  });
}

function cleanLine(raw: string): string {
  return decodeEntities(raw.replace(MARKUP, '').replace(ASS_TAGS, '')).trim();
}

/* ---------------------------------------------------------------------- parsing */

interface RawCue {
  start: number;
  end: number;
  lines: string[];
}

/**
 * Shared line-oriented parser for both formats.
 *
 * A line-by-line state machine rather than splitting on blank lines, because files with
 * missing blank separators between cues are common and a naive split silently merges them.
 */
function parseBlocks(text: string, format: SubtitleFormat): { cues: RawCue[]; warnings: string[] } {
  const lines = text.split(/\r?\n/);
  const cues: RawCue[] = [];
  const warnings: string[] = [];

  const warn = (message: string) => {
    if (warnings.length < MAX_WARNINGS) warnings.push(message);
    else if (warnings.length === MAX_WARNINGS) warnings.push('… further warnings suppressed');
  };

  let i = 0;

  // VTT header, plus any metadata that follows it on the same line.
  if (format === 'vtt' && /^\s*WEBVTT/.test(lines[0] ?? '')) i = 1;

  while (i < lines.length) {
    const line = lines[i] ?? '';

    if (line.trim() === '') {
      i++;
      continue;
    }

    // VTT block types that carry no cues.
    if (format === 'vtt' && /^(NOTE|STYLE|REGION)\b/.test(line.trim())) {
      i++;
      while (i < lines.length && (lines[i] ?? '').trim() !== '') i++;
      continue;
    }

    // An SRT sequence number, or a VTT cue identifier: a line that is not itself a timing
    // line but is directly followed by one.
    if (!line.includes('-->') && (lines[i + 1] ?? '').includes('-->')) {
      i++;
      continue;
    }

    if (!line.includes('-->')) {
      warn(`line ${i + 1}: expected a timing line, got ${JSON.stringify(line.slice(0, 40))}`);
      i++;
      continue;
    }

    const timing = parseTimingLine(line);
    i++;

    if (!timing) {
      warn(`line ${i}: unreadable timestamps ${JSON.stringify(line.slice(0, 60))}`);
      // Skip this cue's text so it isn't mistaken for the next cue.
      while (i < lines.length && (lines[i] ?? '').trim() !== '') i++;
      continue;
    }

    const textLines: string[] = [];
    while (i < lines.length) {
      const current = lines[i] ?? '';
      if (current.trim() === '') break;
      // A missing blank separator: this line starts the next cue.
      if (current.includes('-->')) break;
      if (!current.includes('-->') && (lines[i + 1] ?? '').includes('-->')) break;

      const cleaned = cleanLine(current);
      if (cleaned !== '') textLines.push(cleaned);
      i++;
    }

    if (textLines.length === 0) {
      warn(`cue at ${formatTimestamp(timing.start)} has no text`);
      continue;
    }

    cues.push({ start: timing.start, end: timing.end, lines: textLines });
  }

  return { cues, warnings };
}

/** Default on-screen duration for a cue whose end time is missing or malformed. */
const FALLBACK_CUE_DURATION_S = 2;

/**
 * Sort, sanity-check and index the raw cues.
 *
 * Files are not reliably in chronological order, and zero- or negative-length cues do
 * occur; both would break the lookup's assumption of a sorted, non-degenerate list.
 */
function finalise(raw: RawCue[], warnings: string[]): { cues: Cue[]; warnings: string[] } {
  const sorted = raw.slice().sort((a, b) => a.start - b.start || a.end - b.end);

  const outOfOrder = raw.some((cue, i) => i > 0 && cue.start < (raw[i - 1]?.start ?? 0));
  if (outOfOrder) warnings.push('cues were out of chronological order and have been sorted');

  let repaired = 0;
  const cues: Cue[] = sorted.map((cue, index) => {
    let end = cue.end;
    if (!(end > cue.start)) {
      end = cue.start + FALLBACK_CUE_DURATION_S;
      repaired++;
    }
    return { index, start: cue.start, end, lines: cue.lines };
  });

  if (repaired > 0) {
    warnings.push(`${repaired} cue(s) ended before they started; given a ${FALLBACK_CUE_DURATION_S}s duration`);
  }

  return { cues, warnings };
}

export function parseSRT(text: string): { cues: Cue[]; warnings: string[] } {
  const { cues, warnings } = parseBlocks(text, 'srt');
  return finalise(cues, warnings);
}

export function parseVTT(text: string): { cues: Cue[]; warnings: string[] } {
  const { cues, warnings } = parseBlocks(text, 'vtt');
  return finalise(cues, warnings);
}

/* ----------------------------------------------------------------- entry points */

export class SubtitleParseError extends Error {}

export function parseSubtitleText(text: string, filename: string): SubtitleTrack {
  const format = sniffFormat(text, filename);
  const { cues, warnings } = format === 'vtt' ? parseVTT(text) : parseSRT(text);

  if (cues.length === 0) {
    throw new SubtitleParseError(
      `No subtitles found in "${filename}". ` +
        (warnings[0] ? `First problem: ${warnings[0]}` : 'The file may not be a subtitle file.'),
    );
  }

  return { name: filename, format, cues, warnings, encoding: 'utf-8' };
}

/** Read and parse a file chosen in the panel. */
export async function parseSubtitleFile(file: File): Promise<SubtitleTrack> {
  const buffer = await file.arrayBuffer();
  const { text, encoding } = decodeSubtitleBytes(buffer);
  const track = parseSubtitleText(text, file.name);
  return { ...track, encoding };
}
