import {drizzle} from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import {expertRankings, experts} from '../src/db/schema.js';
import {eq} from 'drizzle-orm';

/**
 * Ingests Mel Kiper Jr.'s 2024 Final Big Board Top 25.
 */

const DIRECT_URL = process.env.DIRECT_URL;
if (!DIRECT_URL) {
  console.error('DIRECT_URL is required');
  process.exit(1);
}

const client = postgres(DIRECT_URL, {max: 1});
const db = drizzle(client);

const KIPER_2024_TOP25 = [
  { rank: 1, player: 'Caleb Williams', pos: 'QB', school: 'USC' },
  { rank: 2, player: 'Jayden Daniels', pos: 'QB', school: 'LSU' },
  { rank: 3, player: 'Marvin Harrison Jr.', pos: 'WR', school: 'Ohio State' },
  { rank: 4, player: 'Rome Odunze', pos: 'WR', school: 'Washington' },
  { rank: 5, player: 'Malik Nabers', pos: 'WR', school: 'LSU' },
  { rank: 6, player: 'Drake Maye', pos: 'QB', school: 'North Carolina' },
  { rank: 7, player: 'Brock Bowers', pos: 'TE', school: 'Georgia' },
  { rank: 8, player: 'Joe Alt', pos: 'OT', school: 'Notre Dame' },
  { rank: 9, player: 'Dallas Turner', pos: 'OLB', school: 'Alabama' },
  { rank: 10, player: 'Troy Fautanu', pos: 'G', school: 'Washington' },
  { rank: 11, player: 'JC Latham', pos: 'OT', school: 'Alabama' },
  { rank: 12, player: 'Laiatu Latu', pos: 'OLB', school: 'UCLA' },
  { rank: 13, player: 'Olu Fashanu', pos: 'OT', school: 'Penn State' },
  { rank: 14, player: 'Cooper DeJean', pos: 'CB', school: 'Iowa' },
  { rank: 15, player: 'J.J. McCarthy', pos: 'QB', school: 'Michigan' },
  { rank: 16, player: 'Taliese Fuaga', pos: 'OT', school: 'Oregon State' },
  { rank: 17, player: 'Brian Thomas Jr.', pos: 'WR', school: 'LSU' },
  { rank: 18, player: 'Xavier Worthy', pos: 'WR', school: 'Texas' },
  { rank: 19, player: 'Graham Barton', pos: 'C', school: 'Duke' },
  { rank: 20, player: 'Quinyon Mitchell', pos: 'CB', school: 'Toledo' },
  { rank: 21, player: 'Terrion Arnold', pos: 'CB', school: 'Alabama' },
  { rank: 22, player: 'Jared Verse', pos: 'DE', school: 'Florida State' },
  { rank: 23, player: 'Amarius Mims', pos: 'OT', school: 'Georgia' },
  { rank: 24, player: 'Michael Penix Jr.', pos: 'QB', school: 'Washington' },
  { rank: 25, player: 'Nate Wiggins', pos: 'CB', school: 'Clemson' }
];

async function ingest() {
  const expert = (await db.select().from(experts).where(eq(experts.slug, 'kiper')).limit(1))[0];
  if (!expert) throw new Error('Expert Mel Kiper Jr. not found.');

  console.log(`Ingesting ${KIPER_2024_TOP25.length} rankings for Mel Kiper Jr. (2024)...`);

  for (const p of KIPER_2024_TOP25) {
    await db.insert(expertRankings).values({
      expertId: expert.id,
      year: 2024,
      playerName: p.player,
      rank: p.rank,
      grade: 'A', 
      commentary: `Top 25 from Kiper's final 2024 Big Board.`
    });
  }

  console.log('Ingestion complete.');
}

ingest().catch(console.error).finally(() => client.end());
