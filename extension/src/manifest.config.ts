import { defineManifest } from '@crxjs/vite-plugin';
import pkg from '../package.json' with { type: 'json' };

export default defineManifest({
  manifest_version: 3,
  name: 'Subtitler',
  version: pkg.version,
  description: pkg.description,

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
    service_worker: 'src/background/index.ts',
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
      js: ['src/content/index.ts'],
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
