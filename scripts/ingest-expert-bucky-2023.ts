import {drizzle} from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import {expertRankings, experts} from '../src/db/schema.js';
import {eq} from 'drizzle-orm';

/**
 * Ingests Bucky Brooks' 2023 Final Top 5 by Position.
 */

const DIRECT_URL = process.env.DIRECT_URL;
if (!DIRECT_URL) {
  console.error('DIRECT_URL is required');
  process.exit(1);
}

const client = postgres(DIRECT_URL, {max: 1});
const db = drizzle(client);

const BUCKY_2023_DATA = [
  // QB
  {player: 'Bryce Young', pos: 'QB', rank: 1},
  {player: 'C.J. Stroud', pos: 'QB', rank: 2},
  {player: 'Anthony Richardson', pos: 'QB', rank: 3},
  {player: 'Will Levis', pos: 'QB', rank: 4},
  {player: 'Hendon Hooker', pos: 'QB', rank: 5},
  // RB
  {player: 'Bijan Robinson', pos: 'RB', rank: 1},
  {player: 'Jahmyr Gibbs', pos: 'RB', rank: 2},
  {player: 'Zach Charbonnet', pos: 'RB', rank: 3},
  // WR
  {player: 'Jaxon Smith-Njigba', pos: 'WR', rank: 1},
  {player: 'Quentin Johnston', pos: 'WR', rank: 2},
  {player: 'Zay Flowers', pos: 'WR', rank: 3},
  // TE
  {player: 'Dalton Kincaid', pos: 'TE', rank: 1},
  {player: 'Michael Mayer', pos: 'TE', rank: 2},
  // OT
  {player: 'Paris Johnson Jr.', pos: 'OT', rank: 1},
  {player: 'Darnell Wright', pos: 'OT', rank: 2},
  // EDGE
  {player: 'Will Anderson Jr.', pos: 'EDGE', rank: 1},
  {player: 'Tyree Wilson', pos: 'EDGE', rank: 2},
  // DT
  {player: 'Jalen Carter', pos: 'DT', rank: 1},
  {player: 'Calijah Kancey', pos: 'DT', rank: 2},
  // CB
  {player: 'Devon Witherspoon', pos: 'CB', rank: 1},
  {player: 'Christian Gonzalez', pos: 'CB', rank: 2},
];

async function ingest() {
  const expert = (await db.select().from(experts).where(eq(experts.slug, 'bucky')).limit(1))[0];
  if (!expert) {
    throw new Error('Expert Bucky Brooks not found.');
  }

  console.log(`Ingesting ${BUCKY_2023_DATA.length} rankings for Bucky Brooks (2023)...`);

  for (const p of BUCKY_2023_DATA) {
    await db.insert(expertRankings).values({
      expertId: expert.id,
      year: 2023,
      playerName: p.player,
      rank: p.rank,
      grade: 'A',
      commentary: `Ranked #${p.rank} at ${p.pos} in Bucky's final 2023 position rankings.`,
    });
  }

  console.log('Ingestion complete.');
}

ingest()
  .catch(console.error)
  .finally(() => client.end());
