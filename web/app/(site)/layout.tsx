import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';
import { DonateBanner } from '@/components/DonateBanner';

/**
 * Rendered per request rather than at build time.
 *
 * These pages read the donation prompt and its links from the database, and the whole
 * point of putting them there is that they change without a deploy. Statically
 * prerendered, the pages baked in whatever the values were when the build ran — adding a
 * donation link in the dashboard did nothing until the next release.
 *
 * The pages are small and the server is already running for the API, so this costs little.
 */
export const dynamic = 'force-dynamic';

/**
 * The public site. `/admin` sits outside this group and has its own shell — a dashboard
 * should not carry a marketing header.
 */
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <DonateBanner />
      <SiteHeader />
      <div className="flex-1">{children}</div>
      <SiteFooter />
    </div>
  );
}
