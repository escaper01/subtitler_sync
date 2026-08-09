import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';
import { Providers } from '@/components/Providers';

/**
 * The public site. `/admin` sits outside this group and has its own shell — a dashboard
 * should not carry a marketing header.
 */
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <Providers>
      <div className="flex min-h-screen flex-col">
        <SiteHeader />
        <div className="flex-1">{children}</div>
        <SiteFooter />
      </div>
    </Providers>
  );
}
