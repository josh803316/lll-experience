import {drizzle} from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import {expertRankings, experts} from '../src/db/schema.js';
import {eq} from 'drizzle-orm';

/**
 * Ingests Matt Miller's 2023 Final Seven-Round Mock.
 * (Truncated to Top 30 for the pilot window ingestion).
 */

const DIRECT_URL = process.env.DIRECT_URL;
if (!DIRECT_URL) {
  console.error('DIRECT_URL is required');
  process.exit(1);
}

const client = postgres(DIRECT_URL, {max: 1});
const db = drizzle(client);

const MILLER_2023_MOCK = [
  {pick: 1, player: 'Bryce Young', team: 'CAR'},
  {pick: 2, player: 'Will Anderson Jr.', team: 'HOU'},
  {pick: 3, player: 'Tyree Wilson', team: 'ARI'},
  {pick: 4, player: 'C.J. Stroud', team: 'IND'},
  {pick: 5, player: 'Jalen Carter', team: 'SEA'},
  {pick: 6, player: 'Devon Witherspoon', team: 'DET'},
  {pick: 7, player: 'Anthony Richardson', team: 'LV'},
  {pick: 8, player: 'Bijan Robinson', team: 'ATL'},
  {pick: 9, player: 'Paris Johnson Jr.', team: 'CHI'},
  {pick: 10, player: 'Nolan Smith', team: 'PHI'},
  {pick: 11, player: 'Peter Skoronski', team: 'TEN'},
  {pick: 13, player: 'Broderick Jones', team: 'NYJ'},
  {pick: 14, player: 'Joey Porter Jr.', team: 'NE'},
  {pick: 17, player: 'Christian Gonzalez', team: 'PIT'},
  {pick: 20, player: 'Jaxon Smith-Njigba', team: 'SEA'},
  {pick: 23, player: 'Will Levis', team: 'MIN'},
  {pick: 25, player: 'Jalin Hyatt', team: 'NYG'},
  {pick: 26, player: 'Michael Mayer', team: 'DAL'},
  {pick: 27, player: 'Quentin Johnston', team: 'BUF'},
];

async function ingest() {
  const expert = (await db.select().from(experts).where(eq(experts.slug, 'matt-miller')).limit(1))[0];
  if (!expert) {
    throw new Error('Expert Matt Miller not found.');
  }

  console.log(`Ingesting ${MILLER_2023_MOCK.length} rankings for Matt Miller (2023)...`);

  for (const p of MILLER_2023_MOCK) {
    await db.insert(expertRankings).values({
      expertId: expert.id,
      year: 2023,
      playerName: p.player,
      rank: p.pick,
      grade: 'A',
      commentary: `Mocked at #${p.pick} to ${p.team} in Miller's final 2023 mock.`,
    });
  }

  console.log('Ingestion complete.');
}

ingest()
  .catch(console.error)
  .finally(() => client.end());
