import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';
import { Providers } from '@/components/Providers';
import { DonationBanner } from '@/components/DonationBanner';

/**
 * Rendered per request rather than at build time.
 *
 * The donation banner reads its text from the database on every page, and the entire point
 * of putting it there is that it can be changed without a deploy. Statically prerendered,
 * these pages baked in whatever the setting happened to be when the build ran — switching
 * the banner on did nothing until the next release.
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
    <Providers>
      <div className="flex min-h-screen flex-col">
        <DonationBanner />
        <SiteHeader />
        <div className="flex-1">{children}</div>
        <SiteFooter />
      </div>
    </Providers>
  );
}
