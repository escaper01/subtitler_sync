import { useEffect, useState } from 'react';
import type { DonatePrompt } from '@/lib/api-types';
import type { ApiResult } from '@/lib/api';
import { askBackground } from '@/lib/messaging';

/**
 * The donation prompt, inside the panel.
 *
 * Everyone sees it — there are no subscribers to exempt, and nothing here is a condition of
 * anything. The extension is free, so this asks rather than gates, and the panel works
 * identically whether or not it is dismissed.
 *
 * The heading, message, colour and every link come from `remote/config.json` and are
 * rendered here **inside somebody else's page**. Text goes in as text — never markup — and
 * the colour has already been validated as `#rrggbb` by `lib/donate.ts` before it reaches
 * a style value. A URL that was not `http`/`https` was dropped there too.
 */

const DISMISS_KEY = 'bannerDismissedUntil';
const SNOOZE_DAYS = 7;

/** The panel is 340px wide. More than two buttons wraps into a wall of colour. */
const MAX_LINKS = 2;

export function PanelBanner() {
  const [prompt, setPrompt] = useState<DonatePrompt | null>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const dismissedUntil = await readDismissal();
      if (dismissedUntil > Date.now()) return;

      const result = await askBackground<ApiResult<DonatePrompt>>({ kind: 'donate' });
      if (cancelled || !result || !result.ok || !result.data.enabled) return;
      if (!result.data.message) return;

      setPrompt(result.data);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  if (!prompt) return null;

  const dismiss = () => {
    setPrompt(null);
    void chrome.storage.local
      .set({ [DISMISS_KEY]: Date.now() + SNOOZE_DAYS * 24 * 60 * 60 * 1000 })
      .catch(() => {});
  };

  const links = prompt.links.slice(0, MAX_LINKS);

  return (
    <div
      className="mb-2.5 rounded border px-2 py-2"
      style={{ borderColor: `${prompt.color}55`, backgroundColor: `${prompt.color}1a` }}
    >
      <div className="flex items-start gap-2">
        <div className="flex-1">
          {prompt.heading && (
            <p className="text-[11px] font-medium text-white/90">{prompt.heading}</p>
          )}
          <p className="mt-0.5 text-[11px] leading-relaxed text-white/80">{prompt.message}</p>
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss"
          className="shrink-0 text-white/40 hover:text-white"
        >
          ×
        </button>
      </div>

      {links.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {links.map((link) => (
            <a
              key={link.url}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block rounded px-2.5 py-1 text-[11px] font-medium text-white transition-opacity hover:opacity-90"
              style={{ backgroundColor: prompt.color }}
            >
              {link.label}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

/** Dismissal snoozes rather than silences — a prompt nobody can bring back is a bug. */
async function readDismissal(): Promise<number> {
  try {
    const stored = await chrome.storage.local.get(DISMISS_KEY);
    const value = stored[DISMISS_KEY];
    return typeof value === 'number' ? value : 0;
  } catch {
    return 0;
  }
}
