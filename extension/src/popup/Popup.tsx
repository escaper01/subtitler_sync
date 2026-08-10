import { useEffect, useState } from 'react';
import type { TabState } from '@/types';
import { EMPTY_TAB_STATE } from '@/types';
import { apiBase } from '@/lib/api';
import { askBackground } from '@/lib/messaging';
import { hostOf, isAllowed, loadSites, onSitesChanged } from '@/lib/sites';
import { Button } from '@/panel/components/ui';
import { SitesEditor } from '@/panel/components/SitesEditor';
import { LicenseBox } from '@/popup/LicenseBox';

/**
 * The toolbar popup.
 *
 * It exists because of the allowlist: on a site that isn't allowed yet nothing of ours is
 * on the page, so there has to be a surface outside the page to turn it on from. Once a
 * site is allowed, everything else happens in the in-page panel.
 */

interface Current {
  tabId: number | null;
  host: string | null;
  state: TabState;
  /** Absolute, because the popup opens it in a new tab. */
  pricingUrl: string;
}

export function Popup() {
  const [current, setCurrent] = useState<Current | null>(null);
  const [sites, setSites] = useState<string[] | null>(null);

  useEffect(() => {
    void loadSites().then(setSites);
    return onSitesChanged(setSites);
  }, []);

  useEffect(() => {
    void (async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const tabId = tab?.id ?? null;
      const state =
        tabId === null
          ? EMPTY_TAB_STATE
          : ((await askBackground<TabState>({ kind: 'popup:get-tab-state', tabId })) ??
            EMPTY_TAB_STATE);

      const base = await apiBase();
      setCurrent({
        tabId,
        host: hostOf(tab?.url),
        state,
        pricingUrl: new URL('pricing', `${base}/`).toString(),
      });
    })();
  }, []);

  if (!current || !sites) return <div className="h-40" />;

  return (
    <div className="flex flex-col">
      <header className="flex items-center gap-2 border-b border-white/10 px-3 py-2">
        <span className="text-[11px] font-semibold tracking-wide text-sky-400">CC</span>
        <span className="text-[12px] font-medium">Subtitler</span>
        <span className="ml-auto font-mono text-[10px] text-white/30">
          v{chrome.runtime.getManifest().version}
        </span>
      </header>

      <div className="space-y-3 px-3 py-3">
        <LicenseBox pricingUrl={current.pricingUrl} />

        <SitesEditor currentHost={current.host} />

        <div className="flex items-center gap-2 border-t border-white/10 pt-2.5">
          <span className="flex-1 text-[10px] leading-tight text-white/40">
            {describe(current.state, isAllowed(current.host, sites))}
          </span>
          <Button
            size="sm"
            onClick={() => void togglePanel(current.tabId)}
            disabled={!current.state.videoAttached}
            title="Also Alt+Shift+S"
          >
            Toggle panel
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Wait for the relay before closing, or the popup can die with the message in flight. */
async function togglePanel(tabId: number | null): Promise<void> {
  if (tabId !== null) await askBackground({ kind: 'popup:toggle-panel', tabId });
  window.close();
}

function describe(state: TabState, enabled: boolean): string {
  if (!enabled) return 'Nothing runs on this page while the site is off.';
  if (state.videoAttached) return 'Attached to the video on this page.';
  if (state.videoSeen) return 'A video is here, but nothing film-length yet.';
  return 'No video detected yet — reload the page if you just enabled it.';
}
