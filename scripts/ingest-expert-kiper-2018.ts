import {drizzle} from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import {expertRankings, experts} from '../src/db/schema.js';
import {eq} from 'drizzle-orm';

/**
 * Ingests Mel Kiper Jr.'s 2018 Final Big Board Top 25.
 */

const DIRECT_URL = process.env.DIRECT_URL;
if (!DIRECT_URL) {
  console.error('DIRECT_URL is required');
  process.exit(1);
}

const client = postgres(DIRECT_URL, {max: 1});
const db = drizzle(client);

const KIPER_2018_TOP25 = [
  {rank: 1, player: 'Saquon Barkley'},
  {rank: 2, player: 'Bradley Chubb'},
  {rank: 3, player: 'Josh Allen'},
  {rank: 4, player: 'Quenton Nelson'},
  {rank: 5, player: 'Sam Darnold'},
  {rank: 6, player: 'Roquan Smith'},
  {rank: 7, player: 'Minkah Fitzpatrick'},
  {rank: 8, player: 'Denzel Ward'},
  {rank: 9, player: 'Derwin James'},
  {rank: 10, player: 'Tremaine Edmunds'},
  {rank: 11, player: 'Josh Rosen'},
  {rank: 12, player: 'Baker Mayfield'},
  {rank: 13, player: 'Vita Vea'},
  {rank: 14, player: 'Mike McGlinchey'},
  {rank: 15, player: 'Calvin Ridley'},
  {rank: 16, player: 'Marcus Davenport'},
  {rank: 17, player: "Da'Ron Payne"},
  {rank: 18, player: 'Harold Landry'},
  {rank: 19, player: 'Lamar Jackson'},
  {rank: 20, player: 'Rashaan Evans'},
  {rank: 21, player: 'Taven Bryan'},
  {rank: 22, player: 'D.J. Moore'},
  {rank: 23, player: 'Leighton Vander Esch'},
  {rank: 24, player: 'Will Hernandez'},
  {rank: 25, player: 'Sony Michel'},
];

async function ingest() {
  const expert = (await db.select().from(experts).where(eq(experts.slug, 'kiper')).limit(1))[0];
  if (!expert) {
    throw new Error('Expert Kiper not found.');
  }

  console.log(`Ingesting ${KIPER_2018_TOP25.length} rankings for Mel Kiper Jr. (2018)...`);

  for (const p of KIPER_2018_TOP25) {
    await db.insert(expertRankings).values({
      expertId: expert.id,
      year: 2018,
      playerName: p.player,
      rank: p.rank,
      grade: 'A',
      commentary: `Top 25 from Kiper's final 2018 Big Board.`,
    });
  }

  console.log('Ingestion complete.');
}

ingest()
  .catch(console.error)
  .finally(() => client.end());
