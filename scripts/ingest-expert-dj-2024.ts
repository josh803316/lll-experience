import {drizzle} from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import {expertRankings, experts} from '../src/db/schema.js';
import {eq} from 'drizzle-orm';

/**
 * Ingests Daniel Jeremiah's 2024 Final Top 50.
 */

const DIRECT_URL = process.env.DIRECT_URL;
if (!DIRECT_URL) {
  console.error('DIRECT_URL is required');
  process.exit(1);
}

const client = postgres(DIRECT_URL, {max: 1});
const db = drizzle(client);

const DJ_2024_TOP50 = [
  { rank: 1, player: 'Caleb Williams', pos: 'QB', school: 'USC' },
  { rank: 2, player: 'Marvin Harrison Jr.', pos: 'WR', school: 'Ohio State' },
  { rank: 3, player: 'Rome Odunze', pos: 'WR', school: 'Washington' },
  { rank: 4, player: 'Malik Nabers', pos: 'WR', school: 'LSU' },
  { rank: 5, player: 'Drake Maye', pos: 'QB', school: 'North Carolina' },
  { rank: 6, player: 'Jayden Daniels', pos: 'QB', school: 'LSU' },
  { rank: 7, player: 'Brock Bowers', pos: 'TE', school: 'Georgia' },
  { rank: 8, player: 'Joe Alt', pos: 'OT', school: 'Notre Dame' },
  { rank: 9, player: 'Terrion Arnold', pos: 'CB', school: 'Alabama' },
  { rank: 10, player: 'Taliese Fuaga', pos: 'OT', school: 'Oregon State' },
  { rank: 11, player: 'Quinyon Mitchell', pos: 'CB', school: 'Toledo' },
  { rank: 12, player: 'Olu Fashanu', pos: 'OT', school: 'Penn State' },
  { rank: 13, player: 'JC Latham', pos: 'OT', school: 'Alabama' },
  { rank: 14, player: 'Jared Verse', pos: 'EDGE', school: 'Florida State' },
  { rank: 15, player: 'Laiatu Latu', pos: 'EDGE', school: 'UCLA' },
  { rank: 16, player: 'Byron Murphy II', pos: 'DT', school: 'Texas' },
  { rank: 17, player: 'Brian Thomas Jr.', pos: 'WR', school: 'LSU' },
  { rank: 18, player: 'Troy Fautanu', pos: 'OT', school: 'Washington' },
  { rank: 19, player: 'Amarius Mims', pos: 'OT', school: 'Georgia' },
  { rank: 20, player: 'Graham Barton', pos: 'IOL', school: 'Duke' },
  { rank: 21, player: 'J.J. McCarthy', pos: 'QB', school: 'Michigan' },
  { rank: 22, player: 'Tyler Guyton', pos: 'OT', school: 'Oklahoma' },
  { rank: 23, player: 'Chop Robinson', pos: 'EDGE', school: 'Penn State' },
  { rank: 24, player: 'Cooper DeJean', pos: 'CB', school: 'Iowa' },
  { rank: 25, player: 'Nate Wiggins', pos: 'CB', school: 'Clemson' },
  { rank: 26, player: 'Jackson Powers-Johnson', pos: 'IOL', school: 'Oregon' },
  { rank: 27, player: 'Darius Robinson', pos: 'EDGE', school: 'Missouri' },
  { rank: 28, player: 'Ladd McConkey', pos: 'WR', school: 'Georgia' },
  { rank: 30, player: 'Bo Nix', pos: 'QB', school: 'Oregon' },
  { rank: 31, player: 'Michael Penix Jr.', pos: 'QB', school: 'Washington' },
  { rank: 33, player: 'Adonai Mitchell', pos: 'WR', school: 'Texas' },
  { rank: 36, player: 'Zach Frazier', pos: 'IOL', school: 'West Virginia' },
  { rank: 38, player: 'Kool-Aid McKinstry', pos: 'CB', school: 'Alabama' },
  { rank: 41, player: 'Xavier Worthy', pos: 'WR', school: 'Texas' },
  { rank: 45, player: 'Edgerrin Cooper', pos: 'LB', school: 'Texas A&M' },
  { rank: 50, player: 'Ricky Pearsall', pos: 'WR', school: 'Florida' }
];

async function ingest() {
  const dj = (await db.select().from(experts).where(eq(experts.slug, 'dj')).limit(1))[0];
  if (!dj) throw new Error('Expert DJ not found.');

  console.log(`Ingesting ${DJ_2024_TOP50.length} rankings for Daniel Jeremiah (2024)...`);

  for (const p of DJ_2024_TOP50) {
    await db.insert(expertRankings).values({
      expertId: dj.id,
      year: 2024,
      playerName: p.player,
      rank: p.rank,
      grade: 'A', 
      commentary: `Ranked #${p.rank} overall by DJ in 2024 final board.`
    });
  }

  console.log('Ingestion complete.');
}

ingest().catch(console.error).finally(() => client.end());
