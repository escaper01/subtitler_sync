import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { loadEnv } from './load-env.mjs';

/**
 * Seed the admin list.
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
 */

const ADMINS = [{ email: 'assaoui54@gmail.com', name: 'Osama' }];

/**
 * Starting prices. Change them in the dashboard, not here — this only seeds an empty
 * database, and re-running the seed deliberately leaves existing rows alone.
 *
 * `checkoutUrl` is blank until the products exist; the pricing page shows such a plan as
 * "coming soon" rather than a button that goes nowhere.
 *
 * Note what this does *not* do on a database that already has plans: the monthly plan was
 * replaced by a six-month one here, but `update: {}` means re-seeding will not remove the
 * old `monthly` row, and it stays visible on the pricing page. Hide it at /admin/settings —
 * hiding rather than deleting, so anyone already on that plan keeps a plan that exists.
 */
const PLANS = [
  {
    slug: 'trial',
    name: 'Free trial',
    priceCents: 0,
    interval: 'TRIAL',
    days: 7,
    blurb: 'Seven days of subtitle search. One per email address.',
    sortOrder: 0,
  },
  {
    slug: 'six-month',
    name: '6 months',
    priceCents: 1200,
    interval: 'SIX_MONTH',
    days: 182,
    blurb: 'Half a year of subtitle search.',
    sortOrder: 1,
  },
  {
    slug: 'yearly',
    name: 'Yearly',
    priceCents: 2000,
    interval: 'YEAR',
    days: 365,
    blurb: 'A full year, cheaper than two half-years.',
    sortOrder: 2,
  },
];

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

  // The settings singleton. Created disabled, so seeding never switches on a banner in
  // front of real users; the dashboard turns it on. `update: {}` means re-running the
  // seed cannot overwrite what the admin has since typed.
  await prisma.siteSetting.upsert({
    where: { id: 'singleton' },
    update: {},
    create: { id: 'singleton' },
  });
  console.log('site settings: ready');

  // Starting prices. `update: {}` again — once the dashboard has been used, the database
  // is the truth and re-seeding must not undo a price change.
  for (const plan of PLANS) {
    await prisma.plan.upsert({ where: { slug: plan.slug }, update: {}, create: plan });
  }
  console.log(`plans: ${PLANS.map((plan) => plan.slug).join(', ')}`);
} catch (err) {
  console.error('Seeding failed:', err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
