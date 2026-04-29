import {drizzle} from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import {expertRankings, experts} from '../src/db/schema.js';
import {eq} from 'drizzle-orm';

/**
 * Ingests Mel Kiper Jr.'s 2025 Final Big Board Top 25.
 */

const DIRECT_URL = process.env.DIRECT_URL;
if (!DIRECT_URL) {
  console.error('DIRECT_URL is required');
  process.exit(1);
}

const client = postgres(DIRECT_URL, {max: 1});
const db = drizzle(client);

const KIPER_2025_TOP25 = [
  {rank: 1, player: 'Travis Hunter', pos: 'WR/CB', school: 'Colorado'},
  {rank: 2, player: 'Abdul Carter', pos: 'OLB', school: 'Penn State'},
  {rank: 3, player: 'Mason Graham', pos: 'DT', school: 'Michigan'},
  {rank: 4, player: 'Ashton Jeanty', pos: 'RB', school: 'Boise State'},
  {rank: 5, player: 'Shedeur Sanders', pos: 'QB', school: 'Colorado'},
  {rank: 6, player: 'Cam Ward', pos: 'QB', school: 'Miami'},
  {rank: 7, player: 'Tyler Warren', pos: 'TE', school: 'Penn State'},
  {rank: 8, player: 'Armand Membou', pos: 'OT', school: 'Missouri'},
  {rank: 9, player: 'Will Campbell', pos: 'OT', school: 'LSU'},
  {rank: 10, player: 'Jalon Walker', pos: 'LB', school: 'Georgia'},
  {rank: 11, player: 'Will Johnson', pos: 'CB', school: 'Michigan'},
  {rank: 12, player: 'Colston Loveland', pos: 'TE', school: 'Michigan'},
  {rank: 13, player: 'Kelvin Banks Jr.', pos: 'OT', school: 'Texas'},
  {rank: 14, player: 'Omarion Hampton', pos: 'RB', school: 'North Carolina'},
  {rank: 15, player: 'Josh Simmons', pos: 'OT', school: 'Ohio State'},
  {rank: 16, player: 'Matthew Golden', pos: 'WR', school: 'Texas'},
  {rank: 17, player: 'Nick Emmanwori', pos: 'S', school: 'South Carolina'},
  {rank: 18, player: 'Mike Green', pos: 'DE', school: 'Marshall'},
  {rank: 19, player: 'Tetairoa McMillan', pos: 'WR', school: 'Arizona'},
  {rank: 20, player: 'Jahdae Barron', pos: 'CB', school: 'Texas'},
  {rank: 21, player: 'Malaki Starks', pos: 'S', school: 'Georgia'},
  {rank: 22, player: 'Nic Scourton', pos: 'DE', school: 'Texas A&M'},
  {rank: 23, player: 'Kenneth Grant', pos: 'DT', school: 'Michigan'},
  {rank: 24, player: 'Luther Burden III', pos: 'WR', school: 'Missouri'},
  {rank: 25, player: 'Aireontae Ersery', pos: 'OT', school: 'Minnesota'},
];

async function ingest() {
  const expert = (await db.select().from(experts).where(eq(experts.slug, 'kiper')).limit(1))[0];
  if (!expert) {
    throw new Error('Expert Mel Kiper Jr. not found.');
  }

  console.log(`Ingesting ${KIPER_2025_TOP25.length} rankings for Mel Kiper Jr. (2025)...`);

  for (const p of KIPER_2025_TOP25) {
    await db.insert(expertRankings).values({
      expertId: expert.id,
      year: 2025,
      playerName: p.player,
      rank: p.rank,
      grade: 'A',
      commentary: `Top 25 from Kiper's final 2025 Big Board.`,
    });
  }

  console.log('Ingestion complete.');
}

ingest()
  .catch(console.error)
  .finally(() => client.end());
