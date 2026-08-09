'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * Mint a token and hand it to the extension.
 *
 * Runs once on mount, because the user got here by asking the extension to sign them in —
 * making them press another button would be asking twice.
 */

type State =
  | { step: 'working' }
  | { step: 'done'; email: string; entitled: boolean }
  | { step: 'failed'; message: string; canRetry: boolean };

declare global {
  interface Window {
    chrome?: {
      runtime?: {
        sendMessage?: (
          extensionId: string,
          message: unknown,
          callback: (response?: unknown) => void,
        ) => void;
        lastError?: { message?: string };
      };
    };
  }
}

export function ConnectClient({ extensionId }: { extensionId: string }) {
  const [state, setState] = useState<State>({ step: 'working' });

  const connect = useCallback(async () => {
    setState({ step: 'working' });

    if (!extensionId) {
      setState({
        step: 'failed',
        message:
          'This site does not know which extension to talk to. NEXT_PUBLIC_EXTENSION_ID is not set.',
        canRetry: false,
      });
      return;
    }

    const send = window.chrome?.runtime?.sendMessage;
    if (typeof send !== 'function') {
      setState({
        step: 'failed',
        message:
          'This page could not reach the extension. Open it from the extension itself, in Chrome or Edge.',
        canRetry: false,
      });
      return;
    }

    let minted: { token: string; expiresAt: string; user: { email: string; entitled: boolean } };
    try {
      const response = await fetch('/api/extension/token', { method: 'POST' });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        setState({
          step: 'failed',
          message: body?.error ?? 'Could not create a sign-in token.',
          canRetry: true,
        });
        return;
      }
      minted = await response.json();
    } catch {
      setState({ step: 'failed', message: 'Could not reach the server.', canRetry: true });
      return;
    }

    // `sendMessage` reports "could not establish connection" through lastError rather than
    // by throwing — that is the extension-not-installed case, and it needs its own words.
    send(
      extensionId,
      { kind: 'subtitler:token', token: minted.token, expiresAt: minted.expiresAt },
      () => {
        const failure = window.chrome?.runtime?.lastError;
        if (failure) {
          setState({
            step: 'failed',
            message:
              'The extension did not answer. Make sure Subtitle Synchronizer is installed and enabled, then try again.',
            canRetry: true,
          });
          return;
        }
        setState({ step: 'done', email: minted.user.email, entitled: minted.user.entitled });
      },
    );
  }, [extensionId]);

  useEffect(() => {
    void connect();
  }, [connect]);

  if (state.step === 'working') {
    return (
      <>
        <h1 className="font-display text-2xl font-bold tracking-tight">Connecting…</h1>
        <p className="mt-3 text-muted">Handing your sign-in to the extension.</p>
      </>
    );
  }

  if (state.step === 'done') {
    return (
      <>
        <h1 className="font-display text-2xl font-bold tracking-tight">
          The extension is signed in
        </h1>
        <p className="mt-3 text-pretty leading-relaxed text-muted">
          Signed in as {state.email}.{' '}
          {state.entitled
            ? 'Subtitle search is ready — close this tab and go back to your video.'
            : 'You do not have a subscription yet, so search is still locked.'}
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <a
            href="/account"
            className="rounded-xl border border-line px-5 py-2.5 text-sm font-medium transition-colors hover:border-accent hover:text-accent"
          >
            Your account
          </a>
        </div>
      </>
    );
  }

  return (
    <>
      <h1 className="font-display text-2xl font-bold tracking-tight">That did not work</h1>
      <p className="mt-3 text-pretty leading-relaxed text-muted">{state.message}</p>
      {state.canRetry && (
        <button
          type="button"
          onClick={() => void connect()}
          className="mt-6 self-start rounded-xl bg-accent-solid px-5 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
        >
          Try again
        </button>
      )}
    </>
  );
}
