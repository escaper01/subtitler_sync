import { announcementFor } from '@/lib/announcement';

/**
 * The donation prompt, on the website.
 *
 * The site has no extension token, so everyone here counts as unsubscribed. Rendered as
 * text with the colour only ever reaching inline style values that have been validated as
 * `#rrggbb` — never as markup.
 */
export async function DonationBanner() {
  const announcement = await announcementFor(false);
  if (!announcement.enabled || !announcement.message) return null;

  return (
    <aside
      className="border-b"
      style={{
        borderColor: `${announcement.color}55`,
        backgroundColor: `${announcement.color}12`,
      }}
    >
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-5 py-2.5">
        <p className="text-sm leading-relaxed">{announcement.message}</p>
        {announcement.url && (
          <a
            href={announcement.url}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto rounded-lg px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90"
            style={{ backgroundColor: announcement.color }}
          >
            Donate
          </a>
        )}
      </div>
    </aside>
  );
}
