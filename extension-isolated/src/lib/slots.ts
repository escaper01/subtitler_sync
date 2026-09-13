import type { SlotId, SubtitleTrack, SyncState, TrackSlot } from '@/types';
import { IDENTITY_SYNC } from '@/types';

/**
 * The two subtitle slots, as pure data.
 *
 * Deliberately free of React, zustand, `chrome.*` and the overlay. Two reasons:
 *
 * - It is the part worth testing. "Loading into one slot leaves the other alone" is easy
 *   to break and invisible on screen until somebody's carefully-synced second track
 *   silently resets.
 * - The search-free build has its own store but the same slots. A pure module copies
 *   across verbatim; a reducer tangled into the store does not.
 */

export const EMPTY_SLOT: TrackSlot = { track: null, sync: IDENTITY_SYNC, visible: true };

export type Slots = [TrackSlot, TrackSlot];

export function emptySlots(): Slots {
  return [{ ...EMPTY_SLOT }, { ...EMPTY_SLOT }];
}

export const SLOT_IDS: readonly SlotId[] = [0, 1];

/** The other one. */
export function otherSlot(id: SlotId): SlotId {
  return id === 0 ? 1 : 0;
}

export function slotName(id: SlotId): string {
  return id === 0 ? 'Primary' : 'Secondary';
}

/**
 * Replace one slot, leaving the other untouched.
 *
 * Returns a new tuple — the panel store compares by reference, and mutating in place would
 * mean a loaded track that never appears.
 */
export function withSlot(slots: Slots, id: SlotId, patch: Partial<TrackSlot>): Slots {
  const next: Slots = [slots[0], slots[1]];
  next[id] = { ...slots[id], ...patch };
  return next;
}

/**
 * Put a track in a slot.
 *
 * **The timing resets with the track**, because an offset fitted against a different file
 * is not a starting point, it is a wrong answer that looks deliberate. Restoring a
 * remembered track and its remembered sync together is a different path — see
 * `storage.ts#loadMovie`.
 */
export function loadIntoSlot(slots: Slots, id: SlotId, track: SubtitleTrack): Slots {
  return withSlot(slots, id, { track, sync: IDENTITY_SYNC, visible: true });
}

export function clearSlot(slots: Slots, id: SlotId): Slots {
  return withSlot(slots, id, { track: null, sync: IDENTITY_SYNC });
}

export function setSlotSync(slots: Slots, id: SlotId, sync: SyncState): Slots {
  return withSlot(slots, id, { sync });
}

export function hasTrack(slots: Slots, id: SlotId): boolean {
  return slots[id].track !== null;
}

export function anyTrack(slots: Slots): boolean {
  return slots[0].track !== null || slots[1].track !== null;
}

/**
 * Which slot a newly loaded track should go into, when the user has not chosen.
 *
 * The empty one, preferring the primary. Loading a second file with dual mode on and
 * having it replace the first is the single most annoying way this feature could behave.
 */
export function nextFreeSlot(slots: Slots, dualEnabled: boolean): SlotId {
  if (!dualEnabled) return 0;
  if (slots[0].track === null) return 0;
  if (slots[1].track === null) return 1;
  return 0;
}
