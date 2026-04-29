import {drizzle} from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import {expertRankings, experts} from '../src/db/schema.js';
import {eq} from 'drizzle-orm';

/**
 * Ingests Daniel Jeremiah's 2025 Final Top 10.
 */

const DIRECT_URL = process.env.DIRECT_URL;
if (!DIRECT_URL) {
  console.error('DIRECT_URL is required');
  process.exit(1);
}

const client = postgres(DIRECT_URL, {max: 1});
const db = drizzle(client);

const DJ_2025_TOP10 = [
  {rank: 1, player: 'Travis Hunter', pos: 'WR/CB', school: 'Colorado'},
  {rank: 2, player: 'Abdul Carter', pos: 'EDGE', school: 'Penn State'},
  {rank: 3, player: 'Ashton Jeanty', pos: 'RB', school: 'Boise State'},
  {rank: 4, player: 'Mason Graham', pos: 'DT', school: 'Michigan'},
  {rank: 5, player: 'Jalon Walker', pos: 'EDGE', school: 'Georgia'},
  {rank: 6, player: 'Tyler Warren', pos: 'TE', school: 'Penn State'},
  {rank: 7, player: 'Colston Loveland', pos: 'TE', school: 'Michigan'},
  {rank: 8, player: 'Cam Ward', pos: 'QB', school: 'Miami'},
  {rank: 9, player: 'Jihaad Campbell', pos: 'LB', school: 'Alabama'},
  {rank: 10, player: 'Will Campbell', pos: 'OT', school: 'LSU'},
];

async function ingest() {
  const dj = (await db.select().from(experts).where(eq(experts.slug, 'dj')).limit(1))[0];
  if (!dj) {
    throw new Error('Expert DJ not found.');
  }

  console.log(`Ingesting ${DJ_2025_TOP10.length} rankings for Daniel Jeremiah (2025)...`);

  for (const p of DJ_2025_TOP10) {
    await db.insert(expertRankings).values({
      expertId: dj.id,
      year: 2025,
      playerName: p.player,
      rank: p.rank,
      grade: 'A',
      commentary: `Ranked #${p.rank} overall by DJ in 2025 final board.`,
    });
  }

  console.log('Ingestion complete.');
}

ingest()
  .catch(console.error)
  .finally(() => client.end());
