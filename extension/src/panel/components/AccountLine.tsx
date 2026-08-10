import { useEffect, useState } from 'react';
import type { MeResponse } from '@/lib/api-types';
import type { ApiResult } from '@/lib/api';
import { askBackground } from '@/lib/messaging';

/**
 * Licence status, in the panel footer.
 *
 * A line rather than a sixth tab: five already nearly fill 340px, and this is something to
 * glance at, not somewhere to go. Entering or removing a key happens in the toolbar popup,
 * which is a real extension page with room for it — and the only surface that should ever
 * hold a credential.
 *
 * Silent when there is no key. The Find tab already says what to do, and the footer is not
 * the place to sell anything.
 */
export function AccountLine() {
  const [me, setMe] = useState<MeResponse | null>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const result = await askBackground<ApiResult<MeResponse>>({ kind: 'auth:state' });
      if (!cancelled && result?.ok) setMe(result.data);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  if (!me?.signedIn) return null;

  return (
    <span className="text-[10px] text-white/30" title={me.email ?? undefined}>
      {me.entitled ? describe(me) : 'licence lapsed'}
    </span>
  );
}

function describe(me: MeResponse): string {
  if (!me.entitledUntil) return 'active';

  const days = Math.ceil((new Date(me.entitledUntil).getTime() - Date.now()) / 86_400_000);
  // Lifetime is stored as a date far enough away that counting days is meaningless.
  if (days > 3650) return 'lifetime';

  const label = me.source === 'TRIAL' ? 'trial' : 'subscribed';
  return days <= 14 ? `${label} · ${days}d left` : label;
}
