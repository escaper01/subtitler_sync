import { useEffect, useState } from 'react';
import type { DonatePrompt } from '@/lib/api-types';
import type { ApiResult } from '@/lib/api';
import { askBackground } from '@/lib/messaging';

/**
 * A quiet "support this" line at the bottom of the popup.
 *
 * Where `LicenseBox` used to be. That box existed because the popup was the only surface
 * safe enough to type a credential into — a real extension page, not a content script in
 * somebody else's document. There is no credential now, so what is left is a link, and it
 * is deliberately the smallest thing on the popup: nothing here gates anything.
 *
 * Asks the worker rather than fetching directly. The popup *could* fetch — it is an
 * extension page, so its requests obey our host permissions — but `lib/api.ts` is
 * worker-only by convention, and one caller breaking that is how it stops being true.
 *
 * Renders nothing until an answer arrives, and nothing at all if the prompt is switched
 * off or has no links. A popup that flashes an empty box on every open is worse than one
 * that never mentions it.
 */
/**
 * What is actually rendered.
 *
 * The single link is resolved *before* it reaches state rather than indexed at render
 * time. Guarding `links.length` and then reading `links[0]` in the JSX is the same thing
 * to a reader and not the same thing to the compiler — the narrowing does not survive the
 * trip through `useState`.
 */
interface Line {
  heading: string;
  color: string;
  label: string;
  url: string;
}

export function DonateLine() {
  const [line, setLine] = useState<Line | null>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const result = await askBackground<ApiResult<DonatePrompt>>({ kind: 'donate' });
      if (cancelled || !result || !result.ok || !result.data.enabled) return;

      // One link only. The popup is 300px wide and this is a footnote, not a call to
      // action; the panel banner is where the full set is offered.
      const first = result.data.links[0];
      if (!first) return;

      setLine({
        heading: result.data.heading,
        color: result.data.color,
        label: first.label,
        url: first.url,
      });
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  if (!line) return null;

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-white/10 pt-2.5">
      <span className="text-[10px] leading-tight text-white/40">
        {line.heading || 'Free, and staying that way.'}
      </span>
      <a
        href={line.url}
        target="_blank"
        rel="noopener noreferrer"
        className="ml-auto text-[10px] font-medium hover:underline"
        style={{ color: line.color }}
      >
        {line.label}
      </a>
    </div>
  );
}
