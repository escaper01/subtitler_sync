import { useEffect, useState } from 'react';
import type { Announcement } from '@/lib/api-types';
import type { ApiResult } from '@/lib/api';
import { askBackground } from '@/lib/messaging';

/**
 * The donation prompt, inside the panel.
 *
 * Whether it applies is decided on the server from the extension's token, so a subscriber
 * is never asked for money they have already given and a signed-out client cannot ask for
 * the subscriber-only variant.
 *
 * The message and colour are admin-supplied and rendered here **inside somebody else's
 * page**. The message goes in as text — never markup — and the colour has already been
 * validated as `#rrggbb` server-side before it reaches a style value.
 */

const DISMISS_KEY = 'bannerDismissedUntil';
const SNOOZE_DAYS = 7;

export function PanelBanner() {
  const [banner, setBanner] = useState<Announcement | null>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const dismissedUntil = await readDismissal();
      if (dismissedUntil > Date.now()) return;

      const result = await askBackground<ApiResult<Announcement>>({ kind: 'announcement' });
      if (cancelled || !result || !result.ok || !result.data.enabled) return;
      if (!result.data.message) return;

      setBanner(result.data);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  if (!banner) return null;

  const dismiss = () => {
    setBanner(null);
    void chrome.storage.local
      .set({ [DISMISS_KEY]: Date.now() + SNOOZE_DAYS * 24 * 60 * 60 * 1000 })
      .catch(() => {});
  };

  return (
    <div
      className="mb-2.5 rounded border px-2 py-2"
      style={{ borderColor: `${banner.color}55`, backgroundColor: `${banner.color}1a` }}
    >
      <div className="flex items-start gap-2">
        <p className="flex-1 text-[11px] leading-relaxed text-white/85">{banner.message}</p>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss"
          className="shrink-0 text-white/40 hover:text-white"
        >
          ×
        </button>
      </div>

      {banner.url && (
        <a
          href={banner.url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 inline-block rounded px-2.5 py-1 text-[11px] font-medium text-white transition-opacity hover:opacity-90"
          style={{ backgroundColor: banner.color }}
        >
          Donate
        </a>
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
