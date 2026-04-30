/**
 * Ingest Lance Zierlein's 2023 NFL Draft Prospect Grades (Top 10ish).
 */

import {drizzle} from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import {experts, expertRankings} from '../src/db/schema.js';
import {eq} from 'drizzle-orm';

const DIRECT_URL = process.env.DIRECT_URL;
if (!DIRECT_URL) {
  console.error('DIRECT_URL is required');
  process.exit(1);
}

const client = postgres(DIRECT_URL, {max: 1});
const db = drizzle(client);

const ZIERLEIN_2023 = [
  {rank: 1, name: 'Jalen Carter', grade: '7.0+'},
  {rank: 2, name: 'Will Anderson Jr.', grade: '7.0+'},
  {rank: 3, name: 'Bryce Young', grade: '6.82'},
  {rank: 4, name: 'Bijan Robinson', grade: '6.80'},
  {rank: 5, name: 'Tyree Wilson', grade: '6.75'},
  {rank: 6, name: 'Drew Sanders', grade: '6.73'},
  {rank: 7, name: 'Peter Skoronski', grade: '6.73'},
  {rank: 8, name: 'Christian Gonzalez', grade: '6.70'},
  {rank: 9, name: 'Luke Musgrave', grade: '6.70'},
  {rank: 10, name: 'Jalin Hyatt', grade: '6.50'},
];

async function ingest() {
  console.log('--- Ingesting Lance Zierlein 2023 Grades ---');

  let expert = (await db.select().from(experts).where(eq(experts.slug, 'zierlein')).limit(1))[0];
  if (!expert) {
    const result = await db
      .insert(experts)
      .values({
        slug: 'zierlein',
        name: 'Lance Zierlein',
        organization: 'NFL.com',
        bio: 'Lead draft analyst for NFL.com, creator of the 8-point grading scale.',
      })
      .returning();
    expert = result[0];
  }

  for (const p of ZIERLEIN_2023) {
    await db.insert(expertRankings).values({
      expertId: expert.id,
      year: 2023,
      playerName: p.name,
      rank: p.rank,
      grade: p.grade,
    });
  }

  console.log('Ingestion complete.');
}

ingest()
  .catch(console.error)
  .finally(() => client.end());
