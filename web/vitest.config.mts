import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  resolve: {
    alias: { '@': resolve(import.meta.dirname, '.') },
  },
  test: {
    // The live smoke test is opt-in — see lib/subtitlecat/live.test.ts. So are the
    // database-backed ones — none remain, but the pattern is kept for when one returns.
    include: ['**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/.next/**'],
    setupFiles: ['./vitest.setup.mts'],
  },
});
