import { useEffect, useState } from 'react';
import { Button, TextInput } from '@/panel/components/ui';
import {
  allowSite,
  blockHost,
  blockSite,
  isAllowed,
  loadSites,
  normalizeDomain,
  onSitesChanged,
} from '@/lib/sites';

/**
 * The allowlist editor, shared by the popup and the panel's Sites tab.
 *
 * It owns its own state rather than going through the panel store, because the popup has
 * no store — and no video — to hang it off.
 *
 * `compact` is for the toolbar popup: most visits are "turn it on for this site" via the
 * checkbox alone, so the custom-domain input and the full site list default to collapsed
 * behind toggles instead of always taking up popup real estate. The panel's Sites tab
 * passes nothing and keeps the full editor open — it's already reached by someone actively
 * managing rotated domains.
 */
export function SitesEditor({
  currentHost,
  compact = false,
}: {
  currentHost: string | null;
  compact?: boolean;
}) {
  const [sites, setSites] = useState<string[] | null>(null);
  // Seeded with the site you are on, since that is the one you are nearly always adding.
  // Typing a domain by hand on a phone-sized panel over a video is nobody's idea of fun.
  const [draft, setDraft] = useState(() => normalizeDomain(currentHost ?? '') ?? '');
  const [error, setError] = useState<string | null>(null);
  const [showCustomAdd, setShowCustomAdd] = useState(!compact);
  const [showList, setShowList] = useState(!compact);

  useEffect(() => {
    void loadSites().then(setSites);
    return onSitesChanged(setSites);
  }, []);

  if (!sites) return null;

  const enabled = isAllowed(currentHost, sites);

  const toggleCurrent = async (): Promise<void> => {
    if (!currentHost) return;
    setSites(enabled ? await blockHost(currentHost) : await allowSite(currentHost));
  };

  const add = async (): Promise<void> => {
    const domain = normalizeDomain(draft);
    if (!domain) {
      setError(`"${draft.trim()}" is not a domain.`);
      return;
    }
    setError(null);
    setDraft('');
    setSites(await allowSite(domain));
  };

  return (
    <div className="space-y-3">
      {currentHost ? (
        <label className="flex cursor-pointer items-center gap-2 rounded border border-white/10 bg-black/30 px-2 py-1.5">
          <input
            type="checkbox"
            checked={enabled}
            onChange={() => void toggleCurrent()}
            className="h-3.5 w-3.5 shrink-0 accent-sky-400"
          />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[12px] font-medium text-white">{currentHost}</span>
            <span className="block text-[10px] text-white/40">
              {enabled ? 'Subtitler runs on this site' : 'Subtitler is off on this site'}
            </span>
          </span>
        </label>
      ) : (
        <p className="rounded border border-white/10 bg-black/30 px-2 py-1.5 text-[11px] text-white/40">
          No site to enable on this page.
        </p>
      )}

      <div>
        {compact ? (
          <button
            type="button"
            onClick={() => setShowList((v) => !v)}
            className="flex w-full items-center gap-1 text-[11px] font-medium text-white/70 hover:text-white"
          >
            <span className="text-white/35">{showList ? '▾' : '▸'}</span>
            Allowed sites
            <span className="text-white/30">({sites.length})</span>
          </button>
        ) : (
          <div className="mb-1 text-[11px] font-medium text-white/70">
            Allowed sites
            <span className="ml-1 text-white/30">({sites.length})</span>
          </div>
        )}

        {showList &&
          (sites.length === 0 ? (
            <p className="mt-1 rounded border border-white/10 px-2 py-1.5 text-[11px] text-white/40">
              None. Subtitler will not run anywhere.
            </p>
          ) : (
            <ul className="mt-1 max-h-44 overflow-y-auto rounded border border-white/10">
              {sites.map((site) => (
                <li
                  key={site}
                  className="flex items-center gap-2 border-b border-white/5 px-2 py-1 last:border-b-0"
                >
                  <span
                    className={`min-w-0 flex-1 truncate font-mono text-[11px] ${
                      currentHost && isAllowed(currentHost, [site])
                        ? 'text-sky-300'
                        : 'text-white/70'
                    }`}
                  >
                    {site}
                  </span>
                  <button
                    type="button"
                    onClick={() => void blockSite(site).then(setSites)}
                    title={`Remove ${site}`}
                    aria-label={`Remove ${site}`}
                    className="shrink-0 rounded px-1 text-white/30 hover:bg-red-500/20 hover:text-red-300"
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          ))}
      </div>

      {showCustomAdd ? (
        <div className="flex gap-1.5">
          <TextInput
            value={draft}
            onChange={(value) => {
              setDraft(value);
              setError(null);
            }}
            onEnter={() => void add()}
            placeholder={currentHost ?? 'example.com'}
            maxLength={253}
            className="min-w-0 flex-1 font-mono"
          />
          <Button size="sm" onClick={() => void add()} disabled={draft.trim().length === 0}>
            Add
          </Button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setShowCustomAdd(true)}
          className="text-[11px] text-sky-300 hover:text-sky-200"
        >
          Add a different domain…
        </button>
      )}

      {error && <p className="text-[11px] text-red-300">{error}</p>}

      <p className="text-[10px] leading-relaxed text-white/30">
        Subtitles are overlaid only on these sites. Subdomains are included, and so is
        whatever the page embeds — allow the site you visit, not the player it loads.
      </p>
    </div>
  );
}
