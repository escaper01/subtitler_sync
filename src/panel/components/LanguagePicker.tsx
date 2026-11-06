import { useEffect, useMemo, useRef, useState } from 'react';
import { LANGUAGES, languageName } from '@/lib/languages';
import { TextInput } from '@/panel/components/ui';

/**
 * The language preference control: one language, chosen from a filterable list.
 *
 * It sits beside the search input because it is not a per-search choice — whatever is
 * picked here is saved and every later search is filtered to it.
 *
 * Single-select on purpose. The API takes one language, and a result list mixing several
 * reads as noise: the point of the filter is to cut the ~150 machine translations each
 * release carries down to the one that is any use.
 */
export function LanguagePicker({
  selected,
  onChange,
}: {
  selected: string;
  onChange: (code: string) => void;
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

  const choose = (code: string): void => {
    onChange(code);
    setOpen(false);
    setFilter('');
  };

  return (
    <div ref={root} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        title="Subtitle language"
        className="flex h-[26px] items-center gap-1 rounded border border-white/10 bg-black/40 px-2 text-[11px] text-white/80 hover:border-white/25"
      >
        <span className="max-w-24 truncate">{languageName(selected)}</span>
        <span className="text-white/40">▾</span>
      </button>

      {open && (
        <div className="absolute right-0 z-10 mt-1 w-52 rounded border border-white/15 bg-neutral-900 shadow-xl">
          <div className="border-b border-white/10 p-1.5">
            <TextInput
              value={filter}
              onChange={setFilter}
              autoFocus
              placeholder="Filter languages"
              className="w-full"
            />
          </div>

          <ul className="max-h-52 overflow-y-auto py-0.5">
            {matches.map((language) => (
              <li key={language.code}>
                <button
                  type="button"
                  onClick={() => choose(language.code)}
                  className={`flex w-full items-center gap-2 px-2 py-1 text-left hover:bg-white/5 ${
                    language.code === selected ? 'bg-white/10' : ''
                  }`}
                >
                  <span className="w-2.5 shrink-0 text-[10px] text-sky-400">
                    {language.code === selected ? '✓' : ''}
                  </span>
                  <span className="flex-1 truncate text-[11px] text-white/80">
                    {language.name}
                  </span>
                  <span className="font-mono text-[10px] text-white/25">{language.code}</span>
                </button>
              </li>
            ))}

            {matches.length === 0 && (
              <li className="px-2 py-2 text-[11px] text-white/35">No language matches that.</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
