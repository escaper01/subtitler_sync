import type { SlotId } from '@/types';
import { usePanel } from '@/panel/store';

/**
 * Primary / Secondary, shown under the tabs while dual mode is on.
 *
 * One selector for the whole panel rather than one per tab. "I am working on the second
 * subtitle" is a single thought, and four independent toggles — File, Find, Sync, Style —
 * would turn it into four, with three chances to be editing the track you are not looking
 * at.
 *
 * It renders nothing when dual mode is off, so the single-track panel is exactly what it
 * was.
 */
export function SlotSelector() {
  const dual = usePanel((s) => s.dual);
  const activeSlot = usePanel((s) => s.activeSlot);
  const setActiveSlot = usePanel((s) => s.setActiveSlot);
  const slots = usePanel((s) => s.slots);

  if (!dual.enabled) return null;

  return (
    <div className="flex items-center gap-1 border-b border-white/10 bg-black/20 px-1.5 py-1">
      {([0, 1] as const).map((id) => (
        <SlotButton
          key={id}
          id={id}
          active={activeSlot === id}
          loaded={slots[id].track !== null}
          onClick={() => setActiveSlot(id)}
        />
      ))}
      <span className="ml-auto pr-1 text-[9px] text-white/30">
        editing the {activeSlot === 0 ? 'primary' : 'secondary'}
      </span>
    </div>
  );
}

function SlotButton({
  id,
  active,
  loaded,
  onClick,
}: {
  id: SlotId;
  active: boolean;
  loaded: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded px-2 py-0.5 text-[10px] font-medium transition-colors ${
        active ? 'bg-sky-500/20 text-sky-200' : 'text-white/40 hover:bg-white/5 hover:text-white/70'
      }`}
    >
      {/* A dot rather than a word, so "has a track" reads at a glance without widening
          a control that sits in a 340px panel. */}
      <span
        aria-hidden
        className={`h-1.5 w-1.5 rounded-full ${loaded ? 'bg-sky-400' : 'bg-white/20'}`}
      />
      {id === 0 ? 'Primary' : 'Secondary'}
    </button>
  );
}
