import { SitesEditor } from '@/panel/components/SitesEditor';
import { topHostname } from '@/lib/sites';

/**
 * Where the extension is allowed to run.
 *
 * The panel lives in the video's frame, which on these sites is a cross-origin embed —
 * `topHostname()` is what gets the site the user actually visited rather than the player's
 * own domain.
 */
export function SitesTab() {
  return <SitesEditor currentHost={topHostname()} />;
}
