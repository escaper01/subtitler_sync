import { defineManifest } from '@crxjs/vite-plugin';
import pkg from '../package.json' with { type: 'json' };

export default defineManifest({
  manifest_version: 3,
  // The Store listing is the search-free build in `extension-lite/`, which keeps the plain
  // name. This one is downloaded from the website and loaded unpacked, so it is named to
  // be told apart in chrome://extensions when both are installed.
  name: 'Subtitle Synchronizer (Full)',
  version: pkg.version,
  // 132 characters is the Web Store's hard limit for the listing summary, and it is
  // truncated in search results well before that. Keep this one line.
  description:
    'Add subtitles to any video: load your own SRT/VTT or find one online, then fix the timing with a click.',

  // Pins the extension's identity, which is what the Chrome Web Store publishes under.
  // This is the PUBLIC half of `extension/key.pem`; regenerate both with `npm run key`, and
  // upload the same key to the Store — otherwise the published extension gets a different
  // id from the one under development.
  //
  // id: gpifnmbipbmkkmpnbcmdlehjbpoheidj
  key: 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAoAARRNo/ke0MXTPpDEub6/zvJa9zyJjN6EDC6JW5iQBC7c2D4kqaZGgpOOztqEqmLRrBQOFwnwEtCmHTWwIM6NEIAs6TI5oBkrILrQtZexE/QOOED0hukMcrVbRJ6f6kuMuSPNChB39+lrpTU0LM/LmPJk/fXKDJ7pUtebuETKSdf3dtgyJe0a+Rp3LUpmXN/ODriILdL8f6BzpIgsr98iYzppAdwLAH1PeJLnzHhoCCvqNoJ3UB5rC3mQiU0IFs2XLAYWeTCsfeLGGTHG0XNszx7/93+Rq7Cym04MEq7cu2Yci2hhS6Z6m7bfAjS7iJt1k+wn3PUyhtlOqUiddHIwIDAQAB',

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
