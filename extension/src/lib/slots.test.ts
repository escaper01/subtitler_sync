import { describe, expect, it } from 'vitest';
import type { SubtitleTrack, SyncState } from '@/types';
import { IDENTITY_SYNC } from '@/types';
import {
  anyTrack,
  clearSlot,
  emptySlots,
  loadIntoSlot,
  nextFreeSlot,
  otherSlot,
  setSlotSync,
  withSlot,
} from '@/lib/slots';
import { toSlots, type MovieState } from '@/lib/storage';

/**
 * The property every one of these is really testing: **the slots do not touch each other.**
 *
 * That is the whole promise of two independently-synced tracks, and it is invisible when
 * broken — the second track keeps playing, just at the wrong time, and it looks like the
 * sync tool is unreliable rather than like the slots are leaking.
 */

function track(name: string, starts: number[] = [0]): SubtitleTrack {
  return {
    name,
    format: 'srt',
    encoding: 'utf-8',
    warnings: [],
    cues: starts.map((start, index) => ({
      index,
      start,
      end: start + 2,
      lines: [`line ${index}`],
    })),
  };
}

const FITTED: SyncState = { scale: 1.042, offset: -3.5, anchors: [null, null] };

describe('slot isolation', () => {
  it('loading into one slot leaves the other track alone', () => {
    let slots = loadIntoSlot(emptySlots(), 0, track('primary.srt'));
    slots = loadIntoSlot(slots, 1, track('secondary.srt'));

    expect(slots[0].track?.name).toBe('primary.srt');
    expect(slots[1].track?.name).toBe('secondary.srt');
  });

  it('loading into one slot leaves the other TIMING alone', () => {
    // The case that actually costs someone their evening: a two-point drift fit on the
    // primary, then a second file dropped into the secondary.
    let slots = loadIntoSlot(emptySlots(), 0, track('primary.srt'));
    slots = setSlotSync(slots, 0, FITTED);
    slots = loadIntoSlot(slots, 1, track('secondary.srt'));

    expect(slots[0].sync).toEqual(FITTED);
    expect(slots[1].sync).toEqual(IDENTITY_SYNC);
  });

  it('syncing one slot leaves the other alone', () => {
    let slots = loadIntoSlot(emptySlots(), 0, track('a.srt'));
    slots = loadIntoSlot(slots, 1, track('b.srt'));
    slots = setSlotSync(slots, 1, FITTED);

    expect(slots[0].sync).toEqual(IDENTITY_SYNC);
    expect(slots[1].sync).toEqual(FITTED);
  });

  it('clearing one slot leaves the other loaded and timed', () => {
    let slots = loadIntoSlot(emptySlots(), 0, track('a.srt'));
    slots = setSlotSync(slots, 0, FITTED);
    slots = loadIntoSlot(slots, 1, track('b.srt'));
    slots = clearSlot(slots, 1);

    expect(slots[0].track?.name).toBe('a.srt');
    expect(slots[0].sync).toEqual(FITTED);
    expect(slots[1].track).toBeNull();
  });

  it('resets the timing when a NEW file replaces one in the same slot', () => {
    // A transform fitted against a different file is not a head start, it is a wrong
    // answer that looks deliberate.
    let slots = loadIntoSlot(emptySlots(), 0, track('a.srt'));
    slots = setSlotSync(slots, 0, FITTED);
    slots = loadIntoSlot(slots, 0, track('b.srt'));

    expect(slots[0].sync).toEqual(IDENTITY_SYNC);
  });

  it('returns a new tuple rather than mutating, or nothing re-renders', () => {
    const before = emptySlots();
    const after = withSlot(before, 1, { visible: false });

    expect(after).not.toBe(before);
    expect(before[1].visible).toBe(true);
    expect(after[1].visible).toBe(false);
  });
});

describe('slot helpers', () => {
  it('otherSlot flips', () => {
    expect(otherSlot(0)).toBe(1);
    expect(otherSlot(1)).toBe(0);
  });

  it('anyTrack is false only when both are empty', () => {
    expect(anyTrack(emptySlots())).toBe(false);
    expect(anyTrack(loadIntoSlot(emptySlots(), 1, track('b.srt')))).toBe(true);
  });

  it('nextFreeSlot prefers the empty one, and the primary when both are free', () => {
    const empty = emptySlots();
    expect(nextFreeSlot(empty, true)).toBe(0);

    const primaryTaken = loadIntoSlot(empty, 0, track('a.srt'));
    expect(nextFreeSlot(primaryTaken, true)).toBe(1);

    const bothTaken = loadIntoSlot(primaryTaken, 1, track('b.srt'));
    expect(nextFreeSlot(bothTaken, true)).toBe(0);
  });

  it('nextFreeSlot always answers primary while dual mode is off', () => {
    const primaryTaken = loadIntoSlot(emptySlots(), 0, track('a.srt'));
    expect(nextFreeSlot(primaryTaken, false)).toBe(0);
  });
});

describe('reading a saved film', () => {
  it('lifts a pre-dual save into the primary, losing nothing', () => {
    // What every existing user has on disk. Discarding it would throw away a timing they
    // spent real effort fitting.
    const legacy = {
      track: track('old.srt', [0, 5]),
      sync: FITTED,
      updatedAt: 123,
    } as MovieState;

    const slots = toSlots(legacy);

    expect(slots[0].track?.name).toBe('old.srt');
    expect(slots[0].sync).toEqual(FITTED);
    expect(slots[1].track).toBeNull();
    expect(slots[1].sync).toEqual(IDENTITY_SYNC);
  });

  it('reads a dual save back unchanged', () => {
    const saved = {
      slots: [
        { track: track('a.srt'), sync: FITTED },
        { track: track('b.srt'), sync: IDENTITY_SYNC },
      ],
      updatedAt: 1,
    } as MovieState;

    const slots = toSlots(saved);

    expect(slots[0].track?.name).toBe('a.srt');
    expect(slots[0].sync).toEqual(FITTED);
    expect(slots[1].track?.name).toBe('b.srt');
  });

  it('fills in a sync missing fields rather than rendering with undefined', () => {
    const partial = {
      slots: [{ track: track('a.srt'), sync: { offset: 4 } }, undefined],
      updatedAt: 1,
    } as unknown as MovieState;

    const slots = toSlots(partial);

    expect(slots[0].sync.offset).toBe(4);
    expect(slots[0].sync.scale).toBe(1);
    expect(slots[0].sync.anchors).toEqual([null, null]);
    expect(slots[1].track).toBeNull();
  });

  it('survives a record with neither shape', () => {
    const slots = toSlots({ updatedAt: 0 } as MovieState);
    expect(slots[0].track).toBeNull();
    expect(slots[1].track).toBeNull();
  });
});
