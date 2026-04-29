import {drizzle} from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import {expertRankings, experts} from '../src/db/schema.js';
import {eq} from 'drizzle-orm';

/**
 * Ingests Dane Brugler's 2025 Final Top 25.
 */

const DIRECT_URL = process.env.DIRECT_URL;
if (!DIRECT_URL) {
  console.error('DIRECT_URL is required');
  process.exit(1);
}

const client = postgres(DIRECT_URL, {max: 1});
const db = drizzle(client);

const BRUGLER_2025_TOP25 = [
  {rank: 1, player: 'Abdul Carter', pos: 'EDGE', school: 'Penn State'},
  {rank: 2, player: 'Travis Hunter', pos: 'CB/WR', school: 'Colorado'},
  {rank: 3, player: 'Jalon Walker', pos: 'EDGE', school: 'Georgia'},
  {rank: 4, player: 'Mason Graham', pos: 'DT', school: 'Michigan'},
  {rank: 5, player: 'Ashton Jeanty', pos: 'RB', school: 'Boise State'},
  {rank: 6, player: 'Will Campbell', pos: 'OT', school: 'LSU'},
  {rank: 7, player: 'Tetairoa McMillan', pos: 'WR', school: 'Arizona'},
  {rank: 8, player: 'Aireontae Ersery', pos: 'OT', school: 'Minnesota'},
  {rank: 9, player: 'Shamar Stewart', pos: 'EDGE', school: 'Texas A&M'},
  {rank: 10, player: 'Tyler Warren', pos: 'TE', school: 'Penn State'},
  {rank: 11, player: 'Colston Loveland', pos: 'TE', school: 'Michigan'},
  {rank: 12, player: 'Mike Green', pos: 'EDGE', school: 'Marshall'},
  {rank: 13, player: 'Malaki Starks', pos: 'S', school: 'Georgia'},
  {rank: 14, player: 'Will Johnson', pos: 'CB', school: 'Michigan'},
  {rank: 15, player: 'Cam Ward', pos: 'QB', school: 'Miami'},
  {rank: 16, player: 'Mykel Williams', pos: 'EDGE', school: 'Georgia'},
  {rank: 17, player: 'Josh Simmons', pos: 'OT', school: 'Ohio State'},
  {rank: 18, player: 'Tyler Booker', pos: 'OG', school: 'Alabama'},
  {rank: 19, player: 'Derrick Harmon', pos: 'DT', school: 'Oregon'},
  {rank: 20, player: 'Luther Burden III', pos: 'WR', school: 'Missouri'},
  {rank: 21, player: 'James Pierce Jr.', pos: 'EDGE', school: 'Tennessee'},
  {rank: 22, player: 'Kelvin Banks Jr.', pos: 'OT', school: 'Texas'},
  {rank: 23, player: 'Jihaad Campbell', pos: 'LB', school: 'Alabama'},
  {rank: 24, player: 'Emeka Egbuka', pos: 'WR', school: 'Ohio State'},
  {rank: 25, player: 'Shedeur Sanders', pos: 'QB', school: 'Colorado'},
];

async function ingest() {
  const expert = (await db.select().from(experts).where(eq(experts.slug, 'brugler')).limit(1))[0];
  if (!expert) {
    throw new Error('Expert Dane Brugler not found.');
  }

  console.log(`Ingesting ${BRUGLER_2025_TOP25.length} rankings for Dane Brugler (2025)...`);

  for (const p of BRUGLER_2025_TOP25) {
    await db.insert(expertRankings).values({
      expertId: expert.id,
      year: 2025,
      playerName: p.player,
      rank: p.rank,
      grade: 'A',
      commentary: `Top 25 from Brugler's final 2025 board.`,
    });
  }

  console.log('Ingestion complete.');
}

ingest()
  .catch(console.error)
  .finally(() => client.end());
