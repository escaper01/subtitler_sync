import { useEffect, useMemo, useRef, useState } from 'react';
import { LANGUAGES } from '@/lib/languages';

/**
 * The language preference control: a dropdown of checkboxes with a filter box.
 *
 * It sits beside the search input because it is not a per-search choice — whatever is
 * ticked here is saved and every later search is filtered to it. Hence the summary label
 * ("English", "3 languages") rather than a list: the point is the setting, not the picker.
 */
export function LanguagePicker({
  selected,
  onChange,
}: {
  selected: readonly string[];
  onChange: (codes: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const root = useRef<HTMLDivElement>(null);

  // Close on an outside click. `composedPath` because everything here is inside a shadow
  // root, where `event.target` is retargeted to the host from the document's view.
  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: Event) => {
      const element = root.current;
      if (element && !event.composedPath().includes(element)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown, true);
    };
  }, [open]);

  const matches = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    if (!needle) return LANGUAGES;
    return LANGUAGES.filter(
      (language) =>
        language.name.toLowerCase().includes(needle) ||
        language.code.toLowerCase().startsWith(needle),
    );
  }, [filter]);

  const toggle = (code: string): void => {
    onChange(
      selected.includes(code)
        ? selected.filter((value) => value !== code)
        : [...selected, code],
    );
  };

  return (
    <div ref={root} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        title="Which languages to show"
        className="flex h-[26px] items-center gap-1 rounded border border-white/10 bg-black/40 px-2 text-[11px] text-white/80 hover:border-white/25"
      >
        <span className="max-w-24 truncate">{summarise(selected)}</span>
        <span className="text-white/40">▾</span>
      </button>

      {open && (
        <div className="absolute right-0 z-10 mt-1 w-52 rounded border border-white/15 bg-neutral-900 shadow-xl">
          <div className="border-b border-white/10 p-1.5">
            <input
              type="text"
              value={filter}
              autoFocus
              placeholder="Filter languages"
              onChange={(e) => setFilter(e.target.value)}
              className="w-full rounded border border-white/10 bg-black/40 px-1.5 py-1 text-[11px] text-white/80 outline-none placeholder:text-white/25 focus:border-sky-400/60"
            />
          </div>

          <ul className="max-h-52 overflow-y-auto py-0.5">
            {matches.map((language) => (
              <li key={language.code}>
                <label className="flex cursor-pointer items-center gap-2 px-2 py-1 hover:bg-white/5">
                  <input
                    type="checkbox"
                    checked={selected.includes(language.code)}
                    onChange={() => toggle(language.code)}
                    className="h-3.5 w-3.5 shrink-0 accent-sky-400"
                  />
                  <span className="flex-1 truncate text-[11px] text-white/80">
                    {language.name}
                  </span>
                  <span className="font-mono text-[10px] text-white/25">{language.code}</span>
                </label>
              </li>
            ))}

            {matches.length === 0 && (
              <li className="px-2 py-2 text-[11px] text-white/35">No language matches that.</li>
            )}
          </ul>

          <div className="flex items-center justify-between border-t border-white/10 px-2 py-1">
            <span className="text-[10px] text-white/30">{selected.length} selected</span>
            <button
              type="button"
              onClick={() => onChange([])}
              className="text-[10px] text-white/45 hover:text-white"
            >
              Reset
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function summarise(selected: readonly string[]): string {
  if (selected.length === 0) return 'English';
  if (selected.length === 1) {
    const only = LANGUAGES.find((language) => language.code === selected[0]);
    return only?.name ?? selected[0]!;
  }
  return `${selected.length} languages`;
}
