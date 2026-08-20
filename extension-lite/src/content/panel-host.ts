import { createRoot, type Root } from 'react-dom/client';
import { createElement } from 'react';
import panelCss from '@/styles/tailwind.css?inline';
import { App } from '@/panel/App';
import { usePanel } from '@/panel/store';
import type { SubtitleOverlay } from '@/content/overlay';
import { log } from '@/lib/log';

/**
 * Mounts the React panel into the page, inside a shadow root.
 *
 * It lives in the same frame as the video (see CLAUDE.md) and, like the overlay, inside
 * the player's container so that it stays visible in fullscreen — which is precisely when
 * the sync tool is most useful.
 */

const HOST_ID = 'subtitler-panel-root';
const PROPERTY_STYLE_ID = 'subtitler-property-rules';

export class PanelHost {
  private host: HTMLDivElement | null = null;
  private root: Root | null = null;
  private mounted = false;
  private disposeShield: (() => void) | null = null;

  mount(video: HTMLVideoElement, overlay: SubtitleOverlay, container: HTMLElement): void {
    if (this.mounted) return;

    this.host = document.createElement('div');
    this.host.id = HOST_ID;
    this.host.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:2147483647;';

    // The player treats clicks on itself as play/pause and mouse movement as "show
    // controls". Neither should happen because someone dragged the panel or typed in it.
    //
    // All three keyboard events, not just keydown: players bind space to play/pause on
    // whichever of them they please, and a stray keyup is enough to pause the film while
    // someone is typing a film's name into the search box.
    const swallowed = [
      'click',
      'dblclick',
      'mousedown',
      'mouseup',
      'pointerdown',
      'keydown',
      'keyup',
      'keypress',
      'wheel',
    ];
    for (const type of swallowed) {
      this.host.addEventListener(type, (event) => event.stopPropagation());
    }

    const shadow = this.host.attachShadow({ mode: 'open' });
    installStyles(shadow, panelCss);

    const mountPoint = document.createElement('div');
    // The host covers the player so the panel can be positioned anywhere over it, but only
    // the panel itself should be clickable — the rest must pass through to the video.
    mountPoint.style.cssText = 'position:absolute;inset:0;pointer-events:none;';
    shadow.appendChild(mountPoint);

    container.appendChild(this.host);

    this.disposeShield = installEarlyTypingShield(this.host);

    this.root = createRoot(mountPoint);
    this.root.render(createElement(App, { video, overlay }));
    this.mounted = true;

    log.info('panel', 'mounted');
  }

  unmount(): void {
    this.root?.unmount();
    this.root = null;
    this.disposeShield?.();
    this.disposeShield = null;
    this.host?.remove();
    this.host = null;
    this.mounted = false;
  }

  /**
   * Show or hide the panel. Kept here rather than in the content entry so that the store —
   * and React with it — stays inside this lazily-loaded module.
   */
  toggle(): void {
    if (this.mounted) usePanel.getState().toggleOpen();
  }

  get isMounted(): boolean {
    return this.mounted;
  }
}

/**
 * The `host`-level swallow listeners above run in the bubble phase, which is too late for a
 * player whose own space-to-play/pause handler sits on `document` (or `window`) in the
 * *capture* phase: that handler runs first, and if it pairs `preventDefault()` with
 * `stopPropagation()` — a common "nobody else gets this key" idiom — the event never
 * reaches our shadow root at all. `TextInput`'s own `defaultPrevented` check can't save it;
 * there is nothing left on our side to run.
 *
 * A capture-phase listener on `window` always fires before one on `document`, regardless of
 * when each was registered — propagation order follows the DOM tree, not registration time.
 * So this intercepts the space key up there, before the page's handler is even reached, and
 * calls only `stopPropagation()` (never `preventDefault()`): that keeps the page from ever
 * seeing the event while leaving the browser's own default action — inserting the
 * character, then firing the native `input` event React's `onChange` listens for — intact.
 * No manual splicing needed; the browser does the correct thing once the page is out of the
 * way.
 */
function installEarlyTypingShield(host: HTMLElement): () => void {
  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== ' ') return;
    if (!event.composedPath().includes(host)) return;

    const target = event.composedPath()[0];
    if (!(target instanceof HTMLElement) || !/^(INPUT|TEXTAREA)$/.test(target.tagName)) return;

    event.stopPropagation();
  };

  window.addEventListener('keydown', onKeyDown, true);
  return () => window.removeEventListener('keydown', onKeyDown, true);
}

/**
 * Install the compiled Tailwind CSS on a shadow root.
 *
 * One wrinkle: `@property` registrations are document-scoped, so rules declared inside a
 * shadow stylesheet may not take effect — which would break the Tailwind utilities that
 * rely on registered custom properties for their initial values (shadows, gradients,
 * transforms). Those declarations are therefore also copied into the host document, where
 * they are inert: registering a custom property has no visual effect on its own.
 */
function installStyles(shadow: ShadowRoot, css: string): void {
  try {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(css);
    shadow.adoptedStyleSheets = [sheet];
  } catch {
    // Constructable stylesheets should exist everywhere we run, but a plain <style> is a
    // perfectly good fallback and costs nothing to keep.
    const element = document.createElement('style');
    element.textContent = css;
    shadow.appendChild(element);
  }

  ensurePropertyRules(css);
}

function ensurePropertyRules(css: string): void {
  if (document.getElementById(PROPERTY_STYLE_ID)) return;

  const rules = css.match(/@property\s+--[\w-]+\s*\{[^}]*\}/g);
  if (!rules || rules.length === 0) return;

  const element = document.createElement('style');
  element.id = PROPERTY_STYLE_ID;
  element.textContent = rules.join('\n');
  document.head?.appendChild(element);
}
