/**
 * Ingest Peter Schrager's 2023 NFL Final Mock Draft.
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

const SCHRAGER_2023 = [
  {rank: 1, name: 'Bryce Young'},
  {rank: 2, name: 'C.J. Stroud'},
  {rank: 3, name: 'Will Anderson Jr.'},
  {rank: 4, name: 'Will Levis'},
  {rank: 5, name: 'Anthony Richardson'},
  {rank: 6, name: 'Devon Witherspoon'},
  {rank: 7, name: 'Tyree Wilson'},
  {rank: 8, name: 'Nolan Smith'},
  {rank: 9, name: 'Paris Johnson Jr.'},
  {rank: 10, name: 'Peter Skoronski'},
  {rank: 11, name: 'Broderick Jones'},
  {rank: 12, name: 'Darnell Wright'},
  {rank: 13, name: 'Jaxon Smith-Njigba'},
  {rank: 14, name: 'Zay Flowers'},
  {rank: 15, name: 'Lukas Van Ness'},
  {rank: 16, name: 'Dalton Kincaid'},
  {rank: 17, name: 'Joey Porter Jr.'},
  {rank: 18, name: 'Myles Murphy'},
  {rank: 19, name: 'Calijah Kancey'},
  {rank: 20, name: 'Jordan Addison'},
  {rank: 21, name: 'Michael Mayer'},
  {rank: 22, name: 'Emmanuel Forbes'},
  {rank: 23, name: 'Bijan Robinson'},
  {rank: 24, name: 'Hendon Hooker'},
  {rank: 25, name: 'Jahmyr Gibbs'},
  {rank: 26, name: 'Steve Avila'},
  {rank: 27, name: 'Mazi Smith'},
  {rank: 28, name: 'Deonte Banks'},
  {rank: 29, name: 'Bryan Bresee'},
  {rank: 30, name: 'Will McDonald IV'},
  {rank: 31, name: 'Jalin Hyatt'},
];

async function ingest() {
  console.log('--- Ingesting Peter Schrager 2023 Final Mock ---');

  let expert = (await db.select().from(experts).where(eq(experts.slug, 'peter-schrager')).limit(1))[0];
  if (!expert) {
    const result = await db
      .insert(experts)
      .values({
        slug: 'peter-schrager',
        name: 'Peter Schrager',
        organization: 'NFL Network',
        bio: 'Host on Good Morning Football and NFL Network analyst, known for highly accurate final mock drafts.',
      })
      .returning();
    expert = result[0];
  }

  for (const p of SCHRAGER_2023) {
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
