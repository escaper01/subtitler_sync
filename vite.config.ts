import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { crx } from '@crxjs/vite-plugin';
import manifest from './src/manifest.config.ts';

const root = import.meta.dirname;

// `vite build` → Chrome/Edge into dist/. `vite build --mode firefox` → Firefox into
// dist-firefox/. See src/manifest.config.ts for what differs between the two.
export default defineConfig(({ mode }) => {
  const firefox = mode === 'firefox';

  return {
    plugins: [react(), tailwindcss(), crx({ manifest, browser: firefox ? 'firefox' : 'chrome' })],
    resolve: {
      alias: { '@': resolve(root, 'src') },
    },
    build: {
      outDir: firefox ? 'dist-firefox' : 'dist',
      // No need to down-level modern APIs like requestVideoFrameCallback. Firefox's floor is
      // the manifest's strict_min_version.
      target: firefox ? 'firefox140' : 'chrome120',
      rollupOptions: {
        // Chrome only. The offscreen document is not in the manifest — the worker opens it
        // by URL — so crxjs does not discover it. It is added as a page here and lands in
        // dist/ at the same relative path, which is what background/offscreen.ts asks for.
        // Firefox parses in its background page and has no such document.
        input: firefox ? undefined : { offscreen: resolve(root, 'src/offscreen/offscreen.html') },
      },
    },
    server: {
      port: 5173,
      strictPort: true,
    },
  };
});
