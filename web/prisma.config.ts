import { defineConfig } from 'prisma/config';

/**
 * Prisma CLI configuration.
 *
 * Prisma 7 removed `url` from the datasource block, so the connection string for `migrate`
 * and `studio` lives here instead. The runtime client gets it separately, through the
 * driver adapter in lib/db.ts — the CLI and the app no longer share that wiring.
 */
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: process.env.DATABASE_URL ?? '',
  },
});
