import {drizzle} from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import {expertRankings, experts} from '../src/db/schema.js';
import {eq} from 'drizzle-orm';

/**
 * Ingests Dane Brugler's 2024 Final Top 25 ("The Beast").
 */

const DIRECT_URL = process.env.DIRECT_URL;
if (!DIRECT_URL) {
  console.error('DIRECT_URL is required');
  process.exit(1);
}

const client = postgres(DIRECT_URL, {max: 1});
const db = drizzle(client);

const BRUGLER_2024_TOP25 = [
  { rank: 1, player: 'Caleb Williams', pos: 'QB', school: 'USC' },
  { rank: 2, player: 'Marvin Harrison Jr.', pos: 'WR', school: 'Ohio State' },
  { rank: 3, player: 'Malik Nabers', pos: 'WR', school: 'LSU' },
  { rank: 4, player: 'Drake Maye', pos: 'QB', school: 'North Carolina' },
  { rank: 5, player: 'Brock Bowers', pos: 'TE', school: 'Georgia' },
  { rank: 6, player: 'Joe Alt', pos: 'OT', school: 'Notre Dame' },
  { rank: 7, player: 'Rome Odunze', pos: 'WR', school: 'Washington' },
  { rank: 8, player: 'Jayden Daniels', pos: 'QB', school: 'LSU' },
  { rank: 9, player: 'Olu Fashanu', pos: 'OT', school: 'Penn State' },
  { rank: 10, player: 'Terrion Arnold', pos: 'CB', school: 'Alabama' },
  { rank: 11, player: 'Quinyon Mitchell', pos: 'CB', school: 'Toledo' },
  { rank: 12, player: 'Latu Laiatu', pos: 'EDGE', school: 'UCLA' },
  { rank: 13, player: 'Dallas Turner', pos: 'EDGE', school: 'Alabama' },
  { rank: 14, player: 'Byron Murphy II', pos: 'DT', school: 'Texas' },
  { rank: 15, player: 'JC Latham', pos: 'OT', school: 'Alabama' },
  { rank: 16, player: 'Troy Fautanu', pos: 'OT', school: 'Washington' },
  { rank: 17, player: 'Taliese Fuaga', pos: 'OT', school: 'Oregon State' },
  { rank: 18, player: 'Graham Barton', pos: 'IOL', school: 'Duke' },
  { rank: 19, player: 'Amarius Mims', pos: 'OT', school: 'Georgia' },
  { rank: 20, player: 'Brian Thomas Jr.', pos: 'WR', school: 'LSU' },
  { rank: 21, player: 'Jared Verse', pos: 'EDGE', school: 'Florida State' },
  { rank: 22, player: 'Chop Robinson', pos: 'EDGE', school: 'Penn State' },
  { rank: 23, player: 'Jackson Powers-Johnson', pos: 'IOL', school: 'Oregon' },
  { rank: 24, player: 'J.J. McCarthy', pos: 'QB', school: 'Michigan' },
  { rank: 25, player: 'Tyler Guyton', pos: 'OT', school: 'Oklahoma' }
];

async function ingest() {
  const expert = (await db.select().from(experts).where(eq(experts.slug, 'brugler')).limit(1))[0];
  if (!expert) throw new Error('Expert Dane Brugler not found.');

  console.log(`Ingesting ${BRUGLER_2024_TOP25.length} rankings for Dane Brugler (2024)...`);

  for (const p of BRUGLER_2024_TOP25) {
    await db.insert(expertRankings).values({
      expertId: expert.id,
      year: 2024,
      playerName: p.player,
      rank: p.rank,
      grade: 'A', 
      commentary: `Top 25 from "The Beast" 2024 final board.`
    });
  }

  console.log('Ingestion complete.');
}

ingest().catch(console.error).finally(() => client.end());
