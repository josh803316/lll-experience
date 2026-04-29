import {drizzle} from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import {expertRankings, experts} from '../src/db/schema.js';
import {eq} from 'drizzle-orm';

/**
 * Ingests Mel Kiper Jr.'s 2023 Final Big Board Top 25.
 */

const DIRECT_URL = process.env.DIRECT_URL;
if (!DIRECT_URL) {
  console.error('DIRECT_URL is required');
  process.exit(1);
}

const client = postgres(DIRECT_URL, {max: 1});
const db = drizzle(client);

const KIPER_2023_TOP25 = [
  { rank: 1, player: 'Jalen Carter', pos: 'DT', school: 'Georgia' },
  { rank: 2, player: 'Will Anderson Jr.', pos: 'OLB', school: 'Alabama' },
  { rank: 3, player: 'Bryce Young', pos: 'QB', school: 'Alabama' },
  { rank: 4, player: 'C.J. Stroud', pos: 'QB', school: 'Ohio State' },
  { rank: 5, player: 'Anthony Richardson', pos: 'QB', school: 'Florida' },
  { rank: 6, player: 'Bijan Robinson', pos: 'RB', school: 'Texas' },
  { rank: 7, player: 'Devon Witherspoon', pos: 'CB', school: 'Illinois' },
  { rank: 8, player: 'Tyree Wilson', pos: 'DE', school: 'Texas Tech' },
  { rank: 9, player: 'Christian Gonzalez', pos: 'CB', school: 'Oregon' },
  { rank: 10, player: 'Peter Skoronski', pos: 'OT/G', school: 'Northwestern' },
  { rank: 11, player: 'Paris Johnson Jr.', pos: 'OT', school: 'Ohio State' },
  { rank: 12, player: 'Will Levis', pos: 'QB', school: 'Kentucky' },
  { rank: 13, player: 'Nolan Smith', pos: 'OLB', school: 'Georgia' },
  { rank: 14, player: 'Jaxon Smith-Njigba', pos: 'WR', school: 'Ohio State' },
  { rank: 15, player: 'Lukas Van Ness', pos: 'DE', school: 'Iowa' },
  { rank: 16, player: 'Dalton Kincaid', pos: 'TE', school: 'Utah' },
  { rank: 17, player: 'Zay Flowers', pos: 'WR', school: 'Boston College' },
  { rank: 18, player: 'Jordan Addison', pos: 'WR', school: 'USC' },
  { rank: 19, player: 'Darnell Wright', pos: 'OT', school: 'Tennessee' },
  { rank: 20, player: 'Michael Mayer', pos: 'TE', school: 'Notre Dame' },
  { rank: 21, player: 'Deonte Banks', pos: 'CB', school: 'Maryland' },
  { rank: 22, player: 'Emmanuel Forbes', pos: 'CB', school: 'Mississippi State' },
  { rank: 23, player: 'Quentin Johnston', pos: 'WR', school: 'TCU' },
  { rank: 24, player: 'Calijah Kancey', pos: 'DT', school: 'Pittsburgh' },
  { rank: 25, player: 'Joey Porter Jr.', pos: 'CB', school: 'Penn State' }
];

async function ingest() {
  const expert = (await db.select().from(experts).where(eq(experts.slug, 'kiper')).limit(1))[0];
  if (!expert) throw new Error('Expert Mel Kiper Jr. not found.');

  console.log(`Ingesting ${KIPER_2023_TOP25.length} rankings for Mel Kiper Jr. (2023)...`);

  for (const p of KIPER_2023_TOP25) {
    await db.insert(expertRankings).values({
      expertId: expert.id,
      year: 2023,
      playerName: p.player,
      rank: p.rank,
      grade: 'A', 
      commentary: `Top 25 from Kiper's final 2023 Big Board.`
    });
  }

  console.log('Ingestion complete.');
}

ingest().catch(console.error).finally(() => client.end());
