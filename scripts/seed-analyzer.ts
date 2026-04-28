import {drizzle} from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import {apps} from '../src/db/schema.js';
import {eq} from 'drizzle-orm';

const DIRECT_URL = process.env.DIRECT_URL;
if (!DIRECT_URL) {
  console.error('DIRECT_URL environment variable is required for seeding');
  process.exit(1);
}

const client = postgres(DIRECT_URL, {max: 1});
const db = drizzle(client);

async function seed() {
  console.log('Seeding Draft Analyzer app...');

  const slug = 'analyzer';
  const existing = (await db.select().from(apps).where(eq(apps.slug, slug)).limit(1))[0];

  if (!existing) {
    await db.insert(apps).values({
      slug,
      name: 'Draft Analyzer',
      description: 'Historical tracking, expert accuracy, and proprietary LLL success metrics.',
      isActive: true,
    });
    console.log('Inserted: Draft Analyzer app');
  } else {
    console.log('Draft Analyzer app already exists.');
  }
}

seed()
  .catch(console.error)
  .finally(() => client.end());
