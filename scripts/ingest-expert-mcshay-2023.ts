/**
 * Ingest Todd McShay's 2023 NFL Draft Top 32 Big Board.
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

const MCSHAY_2023 = [
  {rank: 1, name: 'Bryce Young'},
  {rank: 2, name: 'Will Anderson Jr.'},
  {rank: 3, name: 'C.J. Stroud'},
  {rank: 4, name: 'Tyree Wilson'},
  {rank: 5, name: 'Peter Skoronski'},
  {rank: 6, name: 'Bijan Robinson'},
  {rank: 7, name: 'Christian Gonzalez'},
  {rank: 8, name: 'Paris Johnson Jr.'},
  {rank: 9, name: 'Michael Mayer'},
  {rank: 10, name: 'Nolan Smith'},
  {rank: 11, name: 'Lukas Van Ness'},
  {rank: 12, name: 'Quentin Johnston'},
  {rank: 13, name: 'Jalen Carter'},
  {rank: 14, name: 'Will Levis'},
  {rank: 15, name: 'Jordan Addison'},
  {rank: 16, name: 'Devon Witherspoon'},
  {rank: 17, name: 'Myles Murphy'},
  {rank: 18, name: 'Emmanuel Forbes'},
  {rank: 19, name: 'Joey Porter Jr.'},
  {rank: 20, name: 'Jaxon Smith-Njigba'},
  {rank: 21, name: 'Keion White'},
  {rank: 22, name: 'Dalton Kincaid'},
  {rank: 23, name: 'Anthony Richardson'},
  {rank: 24, name: 'Broderick Jones'},
  {rank: 25, name: 'Deonte Banks'},
  {rank: 26, name: 'Zay Flowers'},
  {rank: 27, name: 'Brian Branch'},
  {rank: 28, name: 'Darnell Wright'},
  {rank: 29, name: 'Calijah Kancey'},
  {rank: 30, name: "O'Cyrus Torrence"},
  {rank: 31, name: 'Mazi Smith'},
  {rank: 32, name: 'Darnell Washington'},
];

async function ingest() {
  console.log('--- Ingesting Todd McShay 2023 Big Board ---');

  let expert = (await db.select().from(experts).where(eq(experts.slug, 'mcshay')).limit(1))[0];
  if (!expert) {
    const result = await db
      .insert(experts)
      .values({
        slug: 'mcshay',
        name: 'Todd McShay',
        organization: 'Independent',
        bio: 'Former ESPN draft analyst, now independent, known for his Big Board and mock drafts.',
      })
      .returning();
    expert = result[0];
  }

  for (const p of MCSHAY_2023) {
    await db.insert(expertRankings).values({
      expertId: expert.id,
      year: 2023,
      playerName: p.name,
      rank: p.rank,
    });
  }

  console.log('Ingestion complete.');
}

ingest()
  .catch(console.error)
  .finally(() => client.end());
