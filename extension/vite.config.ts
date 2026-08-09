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
  },
  server: {
    port: 5173,
    strictPort: true,
  },
});
