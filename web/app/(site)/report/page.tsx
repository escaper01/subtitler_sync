import type { Metadata } from 'next';
import { FeedbackForm } from '@/components/FeedbackForm';

export const metadata: Metadata = {
  title: 'Report a problem',
  description: 'Tell me what went wrong with Subtitle Synchronizer and I will look into it.',
};

export default function ReportPage() {
  return (
    <main className="mx-auto max-w-2xl px-5 py-16">
      <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-drift">Report</p>
      <h1 className="mt-3 font-display text-4xl font-bold tracking-tight text-balance">
        Something went wrong
      </h1>
      <p className="mt-4 text-pretty text-lg leading-relaxed text-muted">
        The more precisely you can say what happened, the faster it gets fixed.
      </p>

      <div className="mt-8 rounded-2xl border border-line bg-surface-2 p-6">
        <p className="font-mono text-[11px] uppercase tracking-widest text-muted">
          Worth including
        </p>
        <ul className="mt-3 space-y-2 text-sm leading-relaxed text-muted">
          <li>Which site, and which film or episode.</li>
          <li>What you did, what happened, and what you expected instead.</li>
          <li>Whether the panel appeared at all.</li>
        </ul>
      </div>

      <div className="mt-8">
        <FeedbackForm
          kind="REPORT"
          subjectLabel="Which site or film? (optional)"
          placeholder="What happened, and what you expected instead."
        />
      </div>
    </main>
  );
}
