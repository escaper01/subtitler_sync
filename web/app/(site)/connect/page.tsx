import type { Metadata } from 'next';
import { ConnectClient } from '@/app/(site)/connect/ConnectClient';

export const metadata: Metadata = {
  title: 'Connect the extension',
  // Nothing here should ever appear in a search result.
  robots: { index: false, follow: false },
};

/**
 * The sign-in handoff.
 *
 * The extension opens this page in a tab. Middleware has already required a session, so by
 * the time it renders the user is signed in; the client component below mints a token and
 * passes it to the extension.
 *
 * It has to be a page rather than something inside the panel: the panel is a content
 * script running inside someone else's document, under their CSP, and cannot open tabs or
 * host an OAuth flow.
 */
export default function ConnectPage() {
  const extensionId = process.env.NEXT_PUBLIC_EXTENSION_ID ?? '';

  return (
    <main className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center px-5 py-16">
      <ConnectClient extensionId={extensionId} />
    </main>
  );
}
