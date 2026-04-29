import {drizzle} from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import {experts} from '../src/db/schema.js';
import {eq} from 'drizzle-orm';

const DIRECT_URL = process.env.DIRECT_URL;
if (!DIRECT_URL) {
  console.error('DIRECT_URL is required');
  process.exit(1);
}

const client = postgres(DIRECT_URL, {max: 1});
const db = drizzle(client);

async function seed() {
  console.log('Seeding Comprehensive LLL Expert List (Top 20)...');
  
  const expertData = [
    // THE HEAVIES
    { slug: 'kiper', name: 'Mel Kiper Jr.', org: 'ESPN' },
    { slug: 'mcshay', name: 'Todd McShay', org: 'Independent' },
    { slug: 'dj', name: 'Daniel Jeremiah', org: 'NFL Network' },
    { slug: 'bucky', name: 'Bucky Brooks', org: 'NFL Network' },
    { slug: 'matt-miller', name: 'Matt Miller', org: 'ESPN' },
    { slug: 'lierlein', name: 'Lance Zierlein', org: 'NFL.com' },
    { slug: 'schrager', name: 'Peter Schrager', org: 'Fox Sports' },
    
    // THE PRECISION SCOUTS
    { slug: 'jason-boris', name: 'Jason Boris', org: 'Times News' },
    { slug: 'brugler', name: 'Dane Brugler', org: 'The Athletic' },
    { slug: 'mcginn', name: 'Bob McGinn', org: 'Go Long' },
    { slug: 'donahue', name: 'Brendan Donahue', org: 'Sharp Football' },
    { slug: 'trapasso', name: 'Chris Trapasso', org: 'CBS Sports' },
    { slug: 'josh-norris', name: 'Josh Norris', org: 'Underdog Fantasy' },
    { slug: 'silva', name: 'Evan Silva', org: 'Establish The Run' },
    
    // DATA & INSTITUTIONAL
    { slug: 'pff', name: 'PFF Analysis', org: 'Pro Football Focus' },
    { slug: 'huddle-report', name: 'The Huddle Report', org: 'THR' },
    { slug: 'walter-football', name: 'Walter Football', org: 'Independent' },
    { slug: 'boone', name: 'Justin Boone', org: 'TheScore' },
    { slug: 'board-guru', name: 'Draft Board Guru', org: 'Independent' },
    { slug: 'draft-ace', name: 'Draft Ace', org: 'Independent' }
  ];

  for (const e of expertData) {
    const existing = (await db.select().from(experts).where(eq(experts.slug, e.slug)).limit(1))[0];
    if (!existing) {
      await db.insert(experts).values({
        slug: e.slug,
        name: e.name,
        organization: e.org,
        bio: `Added to LLL platform for long-term historical tracking (${e.org}).`
      });
      console.log(`Inserted expert: ${e.name}`);
    } else {
      console.log(`Expert already exists: ${e.name}`);
    }
  }

  console.log('Top 20 Expert Seeding Complete.');
}

seed().catch(console.error).finally(() => client.end());
