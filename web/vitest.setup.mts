import { loadEnv } from './prisma/load-env.mjs';

/**
 * Next reads `.env` / `.env.local` by itself; vitest does not. Without this the
 * database-backed tests fail with "DATABASE_URL is not set", which reads like a broken
 * database rather than unloaded configuration.
 *
 * Reuses the loader the Prisma CLI already needs, so there is one parser, not two.
 */
loadEnv();
