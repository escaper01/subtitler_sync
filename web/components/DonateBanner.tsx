import { donatePrompt } from '@/lib/donate';
import { DonateButtons } from '@/components/DonateButtons';

/**
 * The donation prompt, at the top of every public page.
 *
 * Replaces the old upgrade banner, which asked people who had not paid to pay. Everyone
 * sees this one — there is nobody left to exempt — so it is worded as a request rather
 * than a wall, and the page beneath it works whether or not anyone reads it.
 *
 * Renders nothing at all when the prompt is switched off or has no links, rather than an
 * empty bar.
 */
export async function DonateBanner() {
  const prompt = await donatePrompt();
  if (!prompt.enabled || !prompt.message) return null;

  return (
    <aside
      className="border-b"
      style={{
        borderColor: `${prompt.color}55`,
        backgroundColor: `${prompt.color}12`,
      }}
    >
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-5 py-2.5">
        <p className="text-sm leading-relaxed">{prompt.message}</p>
        <div className="ml-auto">
          <DonateButtons links={prompt.links} color={prompt.color} size="sm" />
        </div>
      </div>
    </aside>
  );
}
