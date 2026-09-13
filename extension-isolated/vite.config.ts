import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { crx } from '@crxjs/vite-plugin';
import manifest from './src/manifest.config.ts';

const root = import.meta.dirname;

export default defineConfig({
  plugins: [react(), tailwindcss(), crx({ manifest })],
  resolve: {
    alias: { '@': resolve(root, 'src') },
  },
  build: {
    // Chrome/Edge only — no need to down-level modern APIs like requestVideoFrameCallback.
    target: 'chrome120',
    rollupOptions: {
      // The offscreen document is not in the manifest — the worker opens it by URL — so
      // crxjs does not discover it. It is added as a page here and lands in dist/ at the
      // same relative path, which is what background/offscreen.ts asks for.
      input: { offscreen: resolve(root, 'src/offscreen/offscreen.html') },
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
});
