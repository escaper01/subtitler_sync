import { defineManifest } from '@crxjs/vite-plugin';
import pkg from '../package.json' with { type: 'json' };

export default defineManifest({
  manifest_version: 3,
  name: 'Subtitle Synchronizer',
  version: pkg.version,
  // 132 characters is the Web Store's hard limit for the listing summary, and it is
  // truncated in search results well before that. Keep this one line.
  //
  // No mention of finding subtitles online: this build cannot. It loads a file you already
  // have and fixes its timing, and that is the whole listing.
  description:
    'Add your own SRT/VTT subtitles to any video, show two languages at once, and fix the timing with a click.',

  // Pins the extension's identity, which is what the Chrome Web Store publishes under.
  // This is the PUBLIC half of `extension-lite/key.pem`.
  //
  // **A different key from the full build's, and it has to be.** Two extensions signed
  // with the same key get the same id, and Chrome refuses to load the second one — so a
  // shared key would make it impossible to run both side by side, which is exactly what
  // developing them together requires.
  //
  // id: amfmeepehkpjlcadlkkcbdclfbofebao
  key: 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAtmMF69fMgkv0AnMaroGSmm69RsjBqCYcacxEVM8AWZHi0gCJVX5Z0juac/n8PrOdSp5N3O8Kx+hBokq+P/hdQl1wlRx5Oq/7D1eTHFkc58x0UlTRnltFbA285ONqT79CpaH8C+Zdkjiy1U2Y9wwvU91xXmnhK6aK6Ll9ObFwtc0fE+t9OpVUG0+RS+2hHpaj/DYeMrnWm8qk9dfvzMTepdOAyHrNQ62CBckBWNvCmf+oxFAc6Z664Cpb0+YI+2XtGy96O0nEpfss49YN5poG6/hcKRduaTDVoZJJ592JJJt2/v/a4wVODtCIdYToLQ7yOe/Sbk+7vZMWR+90FDuVWQIDAQAB',

  icons: {
    16: 'icons/icon16.png',
    32: 'icons/icon32.png',
    48: 'icons/icon48.png',
    128: 'icons/icon128.png',
  },

  // The action opens the popup, which is where sites are allowed. It has to be reachable
  // on a page the extension is *not* running on, so it cannot live in the in-page panel.
  action: {
    default_title: 'Subtitler',
    default_popup: 'src/popup/popup.html',
    default_icon: {
      16: 'icons/icon16.png',
      32: 'icons/icon32.png',
    },
  },

  background: {
    // Entry basenames must stay unique across entry points. Rollup names output chunks
    // after the entry's basename, so two files both called `index.ts` collide and the
    // generated service-worker loader can end up importing the *content script* — which
    // throws on `window` in a worker and silently registers no message listener at all.
    service_worker: 'src/background/service-worker.ts',
    type: 'module',
  },

  content_scripts: [
    {
      // Injected everywhere, then gated at runtime against the user's allowlist — which is
      // checked against the *top* page's host, not the frame's. An allowlist expressed as
      // `matches` could not work: the film plays inside a cross-origin embed iframe whose
      // domain rotates and is not the domain anybody would think to allow.
      // See src/lib/sites.ts and CLAUDE.md.
      matches: ['<all_urls>'],
      all_frames: true,
      match_about_blank: true,
      run_at: 'document_start',
      js: ['src/content/content-script.ts'],
    },
  ],

  permissions: ['storage', 'tabs'],
  host_permissions: ['<all_urls>'],

  commands: {
    'toggle-panel': {
      suggested_key: { default: 'Alt+Shift+S' },
      description: 'Toggle the Subtitler panel',
    },
  },
});
