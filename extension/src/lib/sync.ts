import type { Anchor, Cue, SyncState } from '@/types';
import { IDENTITY_SYNC } from '@/types';

/**
 * The whole-track timing transform.
 *
 *   videoTime = cue.start * scale + offset
 *
 * `offset` alone fixes the common case: a track that is simply early or late by a constant.
 * `scale` handles progressive drift, which in practice is always a framerate mismatch —
 * a 25 fps subtitle track laid over a 23.976 fps encode runs ~4.3% fast, which is barely
 * noticeable at the start and more than ten seconds out by the end of a film.
 */

/** Convert a cue's authored time to the video's timebase. */
export function toVideoTime(cueTime: number, sync: SyncState): number {
  return cueTime * sync.scale + sync.offset;
}

/**
 * Convert the video's current time back to the file's timebase.
 * The render loop uses this once per frame, then searches cues in their own coordinates.
 */
export function toCueTime(videoTime: number, sync: SyncState): number {
  return (videoTime - sync.offset) / sync.scale;
}

/* ------------------------------------------------------------------ constraints */

export const MIN_ANCHOR_GAP_S = 60;
export const MIN_SCALE = 0.9;
export const MAX_SCALE = 1.1;

/** Framerate conversions that produce the drift users actually encounter. */
export const FPS_RATIOS: { label: string; value: number }[] = [
  { label: '23.976 → 25 fps', value: 25 / 23.976 },
  { label: '25 → 23.976 fps', value: 23.976 / 25 },
  { label: '23.976 → 24 fps', value: 24 / 23.976 },
  { label: '24 → 23.976 fps', value: 23.976 / 24 },
  { label: '29.97 → 30 fps', value: 30 / 29.97 },
  { label: '30 → 29.97 fps', value: 29.97 / 30 },
];

/** How close a fitted scale must be to a known ratio before we offer to snap to it. */
const SNAP_TOLERANCE = 0.003;

/**
 * If a fitted scale is within tolerance of a standard framerate conversion, return it.
 * Two hand-placed anchors will never land exactly on 1.0427, but snapping to the exact
 * ratio removes the residual drift entirely.
 *
 * A candidate must also explain the measurement better than "no drift at all" does. Some
 * ratios sit very close to 1 — 24/23.976 is only 0.1% — so a plain tolerance check would
 * match an untimed track and invite the user to correct drift that isn't there.
 */
export function snapCandidate(scale: number): { label: string; value: number } | null {
  const distanceFromIdentity = Math.abs(scale - 1);

  let best: { label: string; value: number } | null = null;
  let bestDelta = Infinity;

  for (const ratio of FPS_RATIOS) {
    const absolute = Math.abs(scale - ratio.value);
    if (absolute >= distanceFromIdentity) continue;

    const delta = absolute / ratio.value;
    if (delta < SNAP_TOLERANCE && delta < bestDelta) {
      best = ratio;
      bestDelta = delta;
    }
  }
  return best;
}

/* --------------------------------------------------------------------- fitting */

export function makeAnchor(cue: Cue, videoTime: number): Anchor {
  return { cueIndex: cue.index, cueStart: cue.start, videoTime };
}

/**
 * One-point sync: "this line is being spoken right now".
 * Shifts the track without changing its rate.
 */
export function onePointFit(sync: SyncState, anchor: Anchor): SyncState {
  return {
    ...sync,
    offset: anchor.videoTime - anchor.cueStart * sync.scale,
  };
}

export type TwoPointResult =
  | { ok: true; sync: SyncState; scale: number; driftPerHour: number }
  | { ok: false; error: string };

/**
 * Two-point sync: solve for both rate and offset from anchors near each end of the film.
 *
 * Anchors close together give a wildly wrong slope — a one-second misjudgement over a
 * 30-second span is a 3% rate error — so a minimum separation is enforced, and the result
 * is rejected if it implies a rate no real framerate conversion would produce.
 */
export function twoPointFit(first: Anchor, second: Anchor): TwoPointResult {
  const [a, b] = first.cueStart <= second.cueStart ? [first, second] : [second, first];

  const cueSpan = b.cueStart - a.cueStart;
  const videoSpan = b.videoTime - a.videoTime;

  if (cueSpan < MIN_ANCHOR_GAP_S) {
    return {
      ok: false,
      error: `The two lines are only ${Math.round(cueSpan)}s apart. Pick anchors at least ${MIN_ANCHOR_GAP_S}s apart — ideally one near the start and one near the end — or the rate estimate will be noise.`,
    };
  }

  if (videoSpan <= 0) {
    return { ok: false, error: 'The second anchor is not later in the video than the first.' };
  }

  const scale = videoSpan / cueSpan;

  if (scale < MIN_SCALE || scale > MAX_SCALE) {
    return {
      ok: false,
      error: `That implies the subtitles run at ${(scale * 100).toFixed(1)}% speed, which is outside the plausible range (${MIN_SCALE * 100}–${MAX_SCALE * 100}%). Check that both anchors mark the right lines.`,
    };
  }

  const offset = a.videoTime - a.cueStart * scale;

  return {
    ok: true,
    sync: { scale, offset, anchors: [a, b] },
    scale,
    // What the old transform would have drifted by over an hour — the number that makes
    // "why do subtitles go wrong late in the film" concrete.
    driftPerHour: (scale - 1) * 3600,
  };
}

/* ---------------------------------------------------------------------- nudging */

export function nudge(sync: SyncState, deltaSeconds: number): SyncState {
  return { ...sync, offset: sync.offset + deltaSeconds };
}

export function resetSync(): SyncState {
  return { ...IDENTITY_SYNC, anchors: [null, null] };
}

export function isIdentity(sync: SyncState): boolean {
  return Math.abs(sync.scale - 1) < 1e-9 && Math.abs(sync.offset) < 1e-9;
}

/** Human-readable summary for the panel, e.g. "+2.40s, rate 104.3%". */
export function describeSync(sync: SyncState): string {
  const offset = `${sync.offset >= 0 ? '+' : ''}${sync.offset.toFixed(2)}s`;
  if (Math.abs(sync.scale - 1) < 1e-6) return offset;
  return `${offset}, rate ${(sync.scale * 100).toFixed(2)}%`;
}
