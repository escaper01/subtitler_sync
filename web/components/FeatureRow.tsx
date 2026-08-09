import type { Feature } from '@/lib/features';

/**
 * One feature: what it does, why it matters, and a picture of it.
 *
 * Rows alternate sides so a long list keeps a rhythm. The images are placeholders until
 * real screenshots replace them — see `tools/make-placeholders.mjs`.
 */
export function FeatureRow({ feature, flip }: { feature: Feature; flip: boolean }) {
  return (
    <article className="grid items-center gap-8 py-10 sm:gap-12 lg:grid-cols-2">
      <div className={flip ? 'lg:order-2' : ''}>
        <h3 className="font-display text-2xl font-bold tracking-tight text-balance">
          {feature.name}
        </h3>
        <p className="mt-3 text-pretty text-[17px] leading-relaxed text-text/90">
          {feature.summary}
        </p>
        <p className="mt-3 max-w-lg text-pretty leading-relaxed text-muted">{feature.detail}</p>
      </div>

      <div className={flip ? 'lg:order-1' : ''}>
        {/* eslint-disable-next-line @next/next/no-img-element -- placeholders are SVG and
            get swapped for arbitrary files; next/image would need a size for each. */}
        <img
          src={feature.image}
          alt={feature.alt}
          width={800}
          height={500}
          loading="lazy"
          className="w-full rounded-2xl border border-line bg-frame"
        />
      </div>
    </article>
  );
}
