import { LIFETIME_ENDS_AT } from '@/lib/entitlement';

/**
 * Someone's access, as a pill.
 *
 * Its own file rather than exported from a page: a Next page module may only export
 * `default` and a fixed set of route options, so anything shared has to live outside one.
 */
export function Access({ until, source }: { until: Date | null; source: string | null }) {
  if (!until) {
    return <span className="text-xs text-muted">no subscription</span>;
  }

  const lifetime = until.getTime() === LIFETIME_ENDS_AT.getTime();
  const live = until.getTime() > Date.now();

  return (
    <span
      className={`rounded border px-1.5 py-0.5 text-[11px] ${
        live ? 'border-accent/30 bg-accent/10 text-accent' : 'border-line text-muted'
      }`}
    >
      {lifetime ? 'lifetime' : live ? `until ${until.toISOString().slice(0, 10)}` : 'expired'}
      {source ? ` · ${source.toLowerCase()}` : ''}
    </span>
  );
}
