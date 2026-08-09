/**
 * Placeholder landing page.
 *
 * This app exists for its `/api/*` routes and, later, the admin dashboard at `/admin`.
 * Nothing here is public-facing yet.
 */
export default function Home() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="text-xl font-semibold text-white">Subtitler</h1>
      <p className="mt-2 text-sm text-neutral-400">
        Subtitle search API for the Subtitler browser extension.
      </p>

      <ul className="mt-8 space-y-2 font-mono text-xs text-neutral-500">
        <li>GET /api/search?q=&lt;title&gt;&amp;langs=en,fr</li>
        <li>GET /api/release?path=&lt;release path&gt;&amp;langs=en,fr</li>
        <li>GET /api/download?path=&lt;srt path&gt;</li>
      </ul>
    </main>
  );
}
