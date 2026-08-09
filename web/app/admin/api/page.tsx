import { LANGUAGES } from '@/lib/languages';
import { PAGE_SIZE } from '@/lib/api-types';

/**
 * The API reference, behind the admin gate.
 *
 * It used to sit on the public home page, which advertised the endpoints to anyone who
 * looked. Nothing here is secret exactly, but a documented, un-keyed scraping API on the
 * front page is an invitation.
 */
export default function ApiDocPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="font-display text-2xl font-bold tracking-tight">API</h1>
      <p className="mt-2 text-sm text-muted">
        What the extension calls. All three are GET, CORS-open, and currently unauthenticated.
      </p>

      <Endpoint
        method="GET"
        path="/api/search?q=<title>&lang=en&page=1"
        summary={`One page of ${PAGE_SIZE} releases, each already expanded into its subtitle in that language.`}
        notes={[
          'q — 2 to 100 characters, whitespace collapsed.',
          'lang — exactly one supported code. An unknown one is a 400, not an empty result.',
          'page — 1-based, capped at 50.',
        ]}
      />

      <Endpoint
        method="GET"
        path="/api/release?path=<release path>&lang=en"
        summary="One release's subtitle in one language."
        notes={[
          'path — site-relative, resolved against subtitlecat and rejected if it escapes.',
          'A release that no longer exists answers 404, even though upstream returns 200.',
        ]}
      />

      <Endpoint
        method="GET"
        path="/api/download?path=<srt path>"
        summary="The subtitle text, relayed as text/plain."
        notes={[
          'Relayed rather than redirected, so the upstream URL never reaches the client.',
          'Anything without a timestamp arrow is rejected as not a subtitle.',
        ]}
      />

      <Endpoint
        method="POST"
        path="/api/feedback"
        summary="Bug reports and feature requests. Public."
        notes={['kind — REPORT or FEATURE.', 'message — at least 10 characters, at most 4000.']}
      />

      <section className="mt-10">
        <h2 className="text-sm font-medium text-text">
          Supported languages
          <span className="ml-2 font-normal text-muted">{LANGUAGES.length}</span>
        </h2>
        <p className="mt-1 text-xs text-muted">
          subtitlecat&rsquo;s codes, which are Google-style: Hebrew is <code>iw</code>, Chinese
          splits into <code>zh-CN</code> and <code>zh-TW</code>, Norwegian is <code>no</code>.
        </p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {LANGUAGES.map((language) => (
            <span
              key={language.code}
              className="rounded border border-line bg-surface-3 px-1.5 py-0.5 text-xs text-muted"
            >
              {language.name}
              <span className="ml-1 font-mono text-muted">{language.code}</span>
            </span>
          ))}
        </div>
      </section>
    </main>
  );
}

function Endpoint({
  method,
  path,
  summary,
  notes,
}: {
  method: string;
  path: string;
  summary: string;
  notes: string[];
}) {
  return (
    <section className="mt-6 rounded-xl border border-line bg-surface-2 p-4">
      <div className="flex items-baseline gap-2 overflow-x-auto">
        <span className="shrink-0 rounded bg-accent/10 px-1.5 py-0.5 font-mono text-[11px] text-accent">
          {method}
        </span>
        <code className="whitespace-nowrap font-mono text-xs text-text">{path}</code>
      </div>
      <p className="mt-2 text-sm text-muted">{summary}</p>
      <ul className="mt-2 space-y-1">
        {notes.map((note) => (
          <li key={note} className="text-xs leading-relaxed text-muted">
            {note}
          </li>
        ))}
      </ul>
    </section>
  );
}
