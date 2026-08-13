'use client';

import { useEffect, useRef } from 'react';

/**
 * Reports this device once, after sign-in.
 *
 * Runs only on the web app's account page — never in the extension, which has no session
 * and already has a per-install id for its device limit.
 *
 * Loaded with a dynamic `import()` so FingerprintJS is fetched only for signed-in users on
 * this one page, rather than shipped in the bundle of every marketing page.
 *
 * Everything is best-effort. A browser that blocks the APIs FingerprintJS reads, or an
 * extension that refuses it outright, produces no report and no error — the account works
 * exactly the same either way.
 */
export function DeviceProbe() {
  const sent = useRef(false);

  useEffect(() => {
    // React 18 mounts effects twice in development; without this the endpoint is called
    // twice on every load.
    if (sent.current) return;
    sent.current = true;

    let cancelled = false;

    void (async () => {
      try {
        const FingerprintJS = (await import('@fingerprintjs/fingerprintjs')).default;
        const agent = await FingerprintJS.load();
        const result = await agent.get();
        if (cancelled) return;

        await fetch('/api/account/device', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            visitorId: result.visitorId,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            screen: `${window.screen.width}x${window.screen.height}`,
            platform: navigator.platform,
            languages: navigator.languages?.join(','),
          }),
        });
      } catch {
        // Deliberately silent. See above.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
