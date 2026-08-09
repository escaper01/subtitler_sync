import type { Metadata } from 'next';
import { FeedbackForm } from '@/components/FeedbackForm';

export const metadata: Metadata = {
  title: 'Request a feature',
  description: 'Suggest a site, a language, or a control for Subtitle Synchronizer.',
};

export default function FeatureRequestPage() {
  return (
    <main className="mx-auto max-w-2xl px-5 py-16">
      <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-accent">Request</p>
      <h1 className="mt-3 font-display text-4xl font-bold tracking-tight text-balance">
        Ask for something
      </h1>
      <p className="mt-4 text-pretty text-lg leading-relaxed text-muted">
        A site it should support, a language, a control you keep wishing existed.
      </p>

      <div className="mt-8 rounded-2xl border border-line bg-surface-2 p-6">
        <p className="font-mono text-[11px] uppercase tracking-widest text-muted">
          Most useful to know
        </p>
        <ul className="mt-3 space-y-2 text-sm leading-relaxed text-muted">
          <li>What you are trying to do, not only what to build.</li>
          <li>How you work around it today, if you do.</li>
          <li>How often it comes up.</li>
        </ul>
      </div>

      <div className="mt-8">
        <FeedbackForm
          kind="FEATURE"
          subjectLabel="In one line (optional)"
          placeholder="What you would like it to do, and why it would help."
        />
      </div>
    </main>
  );
}
