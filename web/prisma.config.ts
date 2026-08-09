import { defineConfig } from 'prisma/config';
import { loadEnv } from './prisma/load-env.mjs';

/**
 * Prisma CLI configuration.
 *
 * Prisma 7 removed `url` from the datasource block, so the connection string for `migrate`
 * and `studio` lives here instead. The runtime client gets it separately, through the
 * driver adapter in lib/db.ts — the CLI and the app no longer share that wiring, so a
 * `DATABASE_URL` that only one of them can see is a real failure mode.
 */

// The CLI does not read .env files of its own accord any more. Must run before the config
// object below is evaluated.
loadEnv();

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    // Runs automatically after `prisma migrate dev` and `prisma migrate reset`.
    seed: 'node prisma/seed.mjs',
  },
  datasource: {
    url: process.env.DATABASE_URL ?? '',
  },
});
