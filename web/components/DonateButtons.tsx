import type { DonationLinkView } from '@/lib/api-types';

/**
 * The donation buttons, rendered from `DonationLink` rows.
 *
 * Every value here has been through `lib/donate.ts` — the label is trimmed and truncated,
 * the URL is `http`/`https` or the row was dropped, and the colour is `#rrggbb`. Rendered
 * as text and as an href, never as markup.
 *
 * `provider` picks an icon and nothing else. An unknown value falls back to a generic one
 * rather than failing, so adding a new place to be paid never needs a code change.
 */

const GLYPHS: Record<string, string> = {
  paypal: 'P',
  kofi: '☕',
  buymeacoffee: '☕',
  patreon: 'P',
  github: '♥',
  liberapay: '♪',
};

export function DonateButtons({
  links,
  color,
  size = 'md',
}: {
  links: DonationLinkView[];
  color: string;
  size?: 'sm' | 'md';
}) {
  if (links.length === 0) return null;

  const padding = size === 'sm' ? 'px-3 py-1.5 text-xs' : 'px-4 py-2.5 text-sm';

  return (
    <div className="flex flex-wrap gap-2">
      {links.map((link) => (
        <a
          key={link.url}
          href={link.url}
          target="_blank"
          rel="noopener noreferrer"
          className={`inline-flex items-center gap-2 rounded-xl font-medium text-white transition-opacity hover:opacity-90 ${padding}`}
          style={{ backgroundColor: color }}
        >
          <span aria-hidden className="opacity-80">
            {GLYPHS[link.provider] ?? '♥'}
          </span>
          {link.label}
        </a>
      ))}
    </div>
  );
}
