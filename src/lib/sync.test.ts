import { describe, expect, it } from 'vitest';
import type { Anchor, Cue, SyncState } from '@/types';
import { IDENTITY_SYNC } from '@/types';
import {
  describeSync,
  MIN_ANCHOR_GAP_S,
  onePointFit,
  snapCandidate,
  toCueTime,
  toVideoTime,
  twoPointFit,
} from '@/lib/sync';
import { CueLookup } from '@/lib/subtitles/lookup';

const anchor = (cueStart: number, videoTime: number): Anchor => ({
  cueIndex: 0,
  cueStart,
  videoTime,
});

describe('transforms', () => {
  it('round-trips between the two timebases', () => {
    const sync: SyncState = { scale: 1.0427, offset: -3.2, anchors: [null, null] };
    expect(toCueTime(toVideoTime(1234.5, sync), sync)).toBeCloseTo(1234.5, 6);
  });
});

describe('onePointFit', () => {
  it('shifts the track so the chosen line lands at the current moment', () => {
    const result = onePointFit(IDENTITY_SYNC, anchor(100, 108));
    expect(result.offset).toBeCloseTo(8);
    expect(result.scale).toBe(1);
    expect(toVideoTime(100, result)).toBeCloseTo(108);
  });

  it('leaves an existing rate alone', () => {
    const scaled: SyncState = { scale: 1.05, offset: 0, anchors: [null, null] };
    const result = onePointFit(scaled, anchor(200, 210));
    expect(result.scale).toBe(1.05);
    expect(toVideoTime(200, result)).toBeCloseTo(210);
  });
});

describe('twoPointFit', () => {
  it('solves a 25 → 23.976 fps mismatch', () => {
    const ratio = 25 / 23.976;
    // A track authored at 23.976 fps played against a 25 fps encode: every cue time is
    // stretched by the ratio, plus a constant 2s offset.
    const first = anchor(60, 60 * ratio + 2);
    const second = anchor(5400, 5400 * ratio + 2);

    const result = twoPointFit(first, second);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.scale).toBeCloseTo(ratio, 6);
    expect(result.sync.offset).toBeCloseTo(2, 6);
    expect(toVideoTime(3000, result.sync)).toBeCloseTo(3000 * ratio + 2, 6);
    // ~154 seconds of drift per hour, which is what makes this worth fixing.
    expect(result.driftPerHour).toBeGreaterThan(100);
  });

  it('accepts anchors given in either order', () => {
    const early = anchor(60, 62);
    const late = anchor(3600, 3602);
    const forwards = twoPointFit(early, late);
    const backwards = twoPointFit(late, early);

    expect(forwards.ok && backwards.ok).toBe(true);
    if (!forwards.ok || !backwards.ok) return;
    expect(forwards.scale).toBeCloseTo(backwards.scale, 9);
    expect(forwards.sync.offset).toBeCloseTo(backwards.sync.offset, 9);
  });

  it('refuses anchors that are too close together to estimate a rate', () => {
    const result = twoPointFit(anchor(100, 100), anchor(100 + MIN_ANCHOR_GAP_S - 1, 160));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/apart/);
  });

  it('refuses an implausible rate rather than mangling the track', () => {
    // Second anchor marked on the wrong line: implies subtitles run at ~50% speed.
    const result = twoPointFit(anchor(60, 60), anchor(3660, 1860));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/plausible range/);
  });

  it('refuses anchors that go backwards in the video', () => {
    const result = twoPointFit(anchor(60, 3600), anchor(3600, 60));
    expect(result.ok).toBe(false);
  });
});

describe('snapCandidate', () => {
  it('recognises a hand-fitted rate as a standard framerate conversion', () => {
    const exact = 25 / 23.976;
    expect(snapCandidate(exact * 1.001)?.value).toBeCloseTo(exact, 9);
  });

  it('stays quiet when the rate matches nothing', () => {
    expect(snapCandidate(1.02)).toBeNull();
  });

  it('does not offer a near-1 ratio for an untimed track', () => {
    // 24/23.976 is only 0.1% away from 1, well inside the snap tolerance. Offering it for
    // a track at rate 1.0 would invite the user to correct drift that does not exist.
    expect(snapCandidate(1)).toBeNull();
    expect(snapCandidate(1.0001)).toBeNull();
  });

  it('still offers a near-1 ratio once the fit clearly favours it', () => {
    const ratio = 24 / 23.976;
    expect(snapCandidate(ratio * 1.0001)?.value).toBeCloseTo(ratio, 9);
  });
});

describe('describeSync', () => {
  it('mentions the rate only when it is not 1', () => {
    expect(describeSync({ scale: 1, offset: 2.5, anchors: [null, null] })).toBe('+2.50s');
    expect(describeSync({ scale: 1.05, offset: -1, anchors: [null, null] })).toMatch(/rate 105/);
  });
});

describe('CueLookup', () => {
  const cue = (index: number, start: number, end: number, text = `line ${index}`): Cue => ({
    index,
    start,
    end,
    lines: [text],
  });

  const cues = [cue(0, 1, 3), cue(1, 5, 7), cue(2, 10, 20), cue(3, 12, 14)];
  const lookup = () => new CueLookup(cues);

  it('finds nothing before the first cue or in the gaps', () => {
    expect(lookup().findActive(0)).toEqual([]);
    expect(lookup().findActive(4)).toEqual([]);
    expect(lookup().findActive(100)).toEqual([]);
  });

  it('finds the cue covering a moment', () => {
    expect(lookup().findActive(2).map((c) => c.index)).toEqual([0]);
    expect(lookup().findActive(6).map((c) => c.index)).toEqual([1]);
  });

  it('returns overlapping cues together, in start order', () => {
    expect(lookup().findActive(13).map((c) => c.index)).toEqual([2, 3]);
  });

  it('gives the same answer scanning forwards as seeking randomly', () => {
    const sequential = new CueLookup(cues);
    const seeking = new CueLookup(cues);
    for (let t = 0; t <= 25; t += 0.5) {
      const a = sequential.findActive(t).map((c) => c.index);
      const b = new CueLookup(cues).findActive(t).map((c) => c.index);
      expect(a).toEqual(b);
    }
    // And the cursor must not break a backwards seek.
    seeking.findActive(19);
    expect(seeking.findActive(2).map((c) => c.index)).toEqual([0]);
  });

  it('picks the nearest cue when between two', () => {
    expect(lookup().nearest(2)?.index).toBe(0);
    expect(lookup().nearest(3.5)?.index).toBe(0);
    expect(lookup().nearest(4.5)?.index).toBe(1);
  });

  it('copes with an empty track', () => {
    const empty = new CueLookup([]);
    expect(empty.findActive(5)).toEqual([]);
    expect(empty.nearest(5)).toBeNull();
  });
});
