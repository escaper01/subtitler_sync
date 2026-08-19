import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { loadEnv } from './load-env.mjs';

/**
 * Seed the admin list and the settings singleton.
 *
 *   npm run db:seed
 *
 * Also runs automatically after `prisma migrate dev` and `prisma migrate reset` — see the
 * `seed` entry in prisma.config.ts.
 *
 * An empty `Admin` table locks everyone out of /admin, including whoever set the project
 * up, so this is not optional bookkeeping. Upserts rather than inserts, so it is safe to
 * run repeatedly and cannot fail a migration on the second go.
 *
 * To add another admin, put them in the list below and run it again — or insert a row by
 * hand; nothing here is privileged.
 *
 * It used to seed prices too. There are no plans any more — see the note on
 * `DonationLink`, which is deliberately *not* seeded: donation links point at accounts
 * only the operator has, and a placeholder button that goes nowhere is worse than no
 * button. Add them at /admin/donations.
 */

const ADMINS = [{ email: 'assaoui54@gmail.com', name: 'Osama' }];

loadEnv();

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('DATABASE_URL is not set. Copy .env.example to .env and start the database:');
  console.error('  docker compose up -d');
  process.exit(1);
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

try {
  for (const { email, name } of ADMINS) {
    const address = email.trim().toLowerCase();
    await prisma.admin.upsert({
      where: { email: address },
      update: { name },
      create: { email: address, name },
    });
    console.log(`admin: ${address}`);
  }

  const total = await prisma.admin.count();
  console.log(`${total} admin${total === 1 ? '' : 's'} in the database.`);

  // The settings singleton. Created with the donation prompt disabled, so seeding never
  // switches on a banner in front of real users; the dashboard turns it on. `update: {}`
  // means re-running the seed cannot overwrite what the admin has since typed.
  await prisma.siteSetting.upsert({
    where: { id: 'singleton' },
    update: {},
    create: { id: 'singleton' },
  });
  console.log('site settings: ready');
} catch (err) {
  console.error('Seeding failed:', err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
