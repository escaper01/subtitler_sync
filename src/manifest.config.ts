import { defineManifest } from '@crxjs/vite-plugin';
import pkg from '../package.json' with { type: 'json' };

export default defineManifest({
  manifest_version: 3,
  name: 'Subtitler',
  version: pkg.version,
  description: pkg.description,

  // The action button toggles the in-page panel; see background/index.ts.
  action: {
    default_title: 'Subtitler — toggle panel',
  },

  background: {
    service_worker: 'src/background/index.ts',
    type: 'module',
  },

  content_scripts: [
    {
      // Both the site domain (hdfilme.win/.best/...) and the embed host
      // (dr0pstream.com, dropcdn.io, ...) rotate, so neither can be hardcoded.
      // See src/hosts.ts for the known set and the rationale in CLAUDE.md.
      matches: ['<all_urls>'],
      all_frames: true,
      match_about_blank: true,
      run_at: 'document_start',
      js: ['src/content/index.ts'],
    },
  ],

  permissions: ['storage', 'webRequest', 'webNavigation', 'tabs', 'scripting'],
  host_permissions: ['<all_urls>'],

  commands: {
    'toggle-panel': {
      suggested_key: { default: 'Alt+Shift+S' },
      description: 'Toggle the Subtitler panel',
    },
    'open-debug': {
      suggested_key: { default: 'Alt+Shift+D' },
      description: 'Open the Subtitler debug window',
    },
  },
});
