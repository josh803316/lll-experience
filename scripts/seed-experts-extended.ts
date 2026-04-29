import {drizzle} from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import {experts, apps} from '../src/db/schema.js';
import {eq} from 'drizzle-orm';

const DIRECT_URL = process.env.DIRECT_URL;
if (!DIRECT_URL) {
  console.error('DIRECT_URL is required');
  process.exit(1);
}

const client = postgres(DIRECT_URL, {max: 1});
const db = drizzle(client);

async function seed() {
  console.log('Seeding extended experts list...');
  
  const expertData = [
    { slug: 'boone', name: 'Justin Boone', org: 'TheScore' },
    { slug: 'yahoo-consensus', name: 'Yahoo Consensus', org: 'Yahoo Sports' },
    { slug: 'pff', name: 'PFF Analysis', org: 'Pro Football Focus' },
    { slug: 'the-athletic', name: 'The Athletic Consensus', org: 'The Athletic' }
  ];

  for (const e of expertData) {
    const existing = (await db.select().from(experts).where(eq(experts.slug, e.slug)).limit(1))[0];
    if (!existing) {
      await db.insert(experts).values({
        slug: e.slug,
        name: e.name,
        organization: e.org,
        bio: 'Automated signal from post-draft trade value charts and consensus rankings.'
      });
      console.log(`Inserted expert: ${e.name}`);
    }
  }
}

seed().catch(console.error).finally(() => client.end());
