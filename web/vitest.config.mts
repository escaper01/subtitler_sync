import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  resolve: {
    alias: { '@': resolve(import.meta.dirname, '.') },
  },
  test: {
    // The live smoke test is opt-in — see lib/subtitlecat/live.test.ts.
    include: ['**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/.next/**'],
  },
});
