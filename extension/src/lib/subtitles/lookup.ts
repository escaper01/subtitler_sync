import type { Cue } from '@/types';

/**
 * Finds which cues are on screen at a given time.
 *
 * This runs on every animation frame, so it keeps a cursor into the cue array: during
 * normal playback the answer is the same cue as last time, or the next one, and both cases
 * resolve without a search. Seeking falls back to a binary search.
 */

/** Overlapping cues (two speakers at once) are legal; cap how many we stack. */
const MAX_SIMULTANEOUS = 3;

export class CueLookup {
  private cursor = 0;

  constructor(private readonly cues: readonly Cue[]) {}

  get length(): number {
    return this.cues.length;
  }

  /**
   * Cues active at `time` (in the file's own timebase — apply the sync transform first).
   * Returns an empty array between cues.
   */
  findActive(time: number): Cue[] {
    const index = this.indexOfLastStartingAtOrBefore(time);
    if (index < 0) return [];

    this.cursor = index;

    const active: Cue[] = [];
    // Walk backwards: an earlier, longer cue can still be on screen underneath this one.
    for (let i = index; i >= 0 && active.length < MAX_SIMULTANEOUS; i--) {
      const cue = this.cues[i];
      if (!cue) break;
      if (cue.end > time) active.push(cue);
      // A cue starting more than this far back cannot still be running unless subtitles
      // are pathological; stop rather than scanning the whole file on every frame.
      else if (index - i > MAX_SIMULTANEOUS * 2) break;
    }

    return active.reverse();
  }

  /** Index of the last cue whose start is <= time, or -1 if time precedes every cue. */
  private indexOfLastStartingAtOrBefore(time: number): number {
    const cues = this.cues;
    if (cues.length === 0) return -1;

    // Fast path: playback usually lands on the cursor's cue or the one after it.
    const current = cues[this.cursor];
    if (current && current.start <= time) {
      const next = cues[this.cursor + 1];
      if (!next || next.start > time) return this.cursor;
      const afterNext = cues[this.cursor + 2];
      if (!afterNext || afterNext.start > time) return this.cursor + 1;
    }

    let low = 0;
    let high = cues.length - 1;
    let found = -1;

    while (low <= high) {
      const mid = (low + high) >> 1;
      const cue = cues[mid];
      if (!cue) break;
      if (cue.start <= time) {
        found = mid;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }

    return found;
  }

  /** The cue that would be showing at `time`, or the nearest one — used by the sync tool. */
  nearest(time: number): Cue | null {
    const index = this.indexOfLastStartingAtOrBefore(time);
    if (index < 0) return this.cues[0] ?? null;

    const cue = this.cues[index];
    if (!cue) return null;
    if (cue.end > time) return cue;

    // Between cues: pick whichever boundary is closer.
    const next = this.cues[index + 1];
    if (!next) return cue;
    return time - cue.end <= next.start - time ? cue : next;
  }
}
