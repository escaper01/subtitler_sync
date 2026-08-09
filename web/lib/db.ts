import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

/**
 * The Prisma client, as one instance per process.
 *
 * Prisma 7 connects through a driver adapter rather than a URL in the schema, so the
 * connection string is read here. It is read lazily — at first query, not at import — so
 * that a missing `DATABASE_URL` surfaces as one failed page rather than a build that
 * cannot even start.
 *
 * Next's dev server reloads modules on every edit; a fresh `PrismaClient` each time
 * exhausts the connection limit within a few saves. Stashing it on `globalThis` is the
 * standard way out, and is a no-op in production where modules load once.
 */

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function create(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set — see .env.example');
  }
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

export const db: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, property) {
    const client = (globalForPrisma.prisma ??= create());
    return Reflect.get(client, property, client);
  },
});
