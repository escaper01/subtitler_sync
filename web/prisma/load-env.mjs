import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Load `.env.local`, then `.env`, into `process.env`.
 *
 * Next loads these by itself, but the Prisma CLI does not: Prisma 7 dropped its automatic
 * `.env` handling when it moved configuration into `prisma.config.ts`. Without this,
 * `prisma migrate` sees no `DATABASE_URL` and reports an empty connection string, which
 * reads as a broken database rather than as unloaded configuration.
 *
 * Precedence matches Next's: `.env.local` wins over `.env`, and anything already set in
 * the real environment wins over both — so CI and Vercel are untouched by this.
 */

const WEB_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export function loadEnv() {
  for (const name of ['.env.local', '.env']) {
    let source;
    try {
      source = readFileSync(resolve(WEB_ROOT, name), 'utf8');
    } catch {
      continue; // Absent is normal — .env.local is not committed.
    }

    for (const line of source.split(/\r?\n/)) {
      const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
      if (!match) continue; // blank line or comment

      const [, key, rawValue] = match;
      if (key in process.env) continue;

      // Strip one layer of matching quotes; leave everything else exactly as written.
      const value = rawValue.trim().replace(/^(['"])([\s\S]*)\1$/, '$2');
      process.env[key] = value;
    }
  }
}
