import { useEffect, useState } from 'react';
import type { MeResponse } from '@/lib/api-types';
import type { ApiResult } from '@/lib/api';
import { askBackground } from '@/lib/messaging';
import { Button, TextInput } from '@/panel/components/ui';

/**
 * Where the licence key is entered.
 *
 * The popup, and nowhere else. It is a real extension page, so it can hold a credential
 * and open links; the in-page panel runs inside somebody else's document and should never
 * do either.
 *
 * Saving checks the key immediately rather than reporting "saved", because a key that was
 * mistyped is the common case and the difference matters before someone goes back to their
 * film and finds search still refusing them.
 */
export function LicenseBox({ pricingUrl }: { pricingUrl: string }) {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void askBackground<ApiResult<MeResponse>>({ kind: 'auth:state' }).then((result) => {
      if (result?.ok) setMe(result.data);
    });
  }, []);

  const save = async (): Promise<void> => {
    const key = draft.trim();
    if (!key) return;

    setBusy(true);
    setError(null);

    const result = await askBackground<ApiResult<MeResponse>>({ kind: 'auth:set-key', key });
    setBusy(false);

    if (!result) {
      setError('The extension went away. Try again.');
      return;
    }
    if (!result.ok) {
      setError(result.error);
      return;
    }
    if (!result.data.signedIn) {
      // The server answered, and does not know this key.
      setError('That key was not recognised. Check it against the email you were sent.');
      return;
    }

    setMe(result.data);
    setDraft('');
  };

  const remove = async (): Promise<void> => {
    setBusy(true);
    await askBackground({ kind: 'auth:clear' });
    setBusy(false);
    setMe(null);
  };

  if (me?.signedIn) {
    return (
      <div className="rounded border border-white/10 bg-black/30 px-2 py-2">
        <p className="truncate text-[11px] font-medium text-white/85" title={me.email ?? ''}>
          {me.email ?? 'Licence active'}
        </p>
        <p className="mt-0.5 text-[10px] text-white/45">{describe(me)}</p>

        <div className="mt-2 flex gap-1.5">
          {!me.entitled && (
            <a
              href={pricingUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded bg-sky-500 px-2 py-1 text-[11px] font-medium text-white hover:bg-sky-400"
            >
              Renew
            </a>
          )}
          <Button size="sm" variant="ghost" onClick={() => void remove()} disabled={busy}>
            Remove key
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded border border-white/10 bg-black/30 px-2 py-2">
      <p className="text-[11px] font-medium text-white/85">Subtitle search</p>
      <p className="mt-0.5 text-[10px] leading-relaxed text-white/45">
        Paste the licence key from your email. Loading your own subtitle files needs no key.
      </p>

      <div className="mt-2 flex gap-1.5">
        <TextInput
          value={draft}
          onChange={setDraft}
          onEnter={() => void save()}
          placeholder="0000-0000-0000-0000"
          maxLength={80}
          className="min-w-0 flex-1 font-mono"
        />
        <Button size="sm" onClick={() => void save()} disabled={busy || draft.trim().length < 8}>
          {busy ? '…' : 'Save'}
        </Button>
      </div>

      {error && <p className="mt-1.5 text-[10px] text-red-300">{error}</p>}

      <a
        href={pricingUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-2 inline-block text-[10px] text-sky-400 hover:text-sky-300"
      >
        Get a key, or try it free →
      </a>
    </div>
  );
}

function describe(me: MeResponse): string {
  if (!me.entitled) return 'Subscription has run out.';
  if (!me.entitledUntil) return 'Active.';

  const days = Math.ceil((new Date(me.entitledUntil).getTime() - Date.now()) / 86_400_000);
  // Lifetime is stored as a date far enough away that counting days is meaningless.
  if (days > 3650) return 'Active — no expiry.';

  const label = me.source === 'TRIAL' ? 'Trial' : 'Active';
  return `${label} — ${days} day${days === 1 ? '' : 's'} left.`;
}
