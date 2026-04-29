import {drizzle} from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import {expertRankings, experts} from '../src/db/schema.js';
import {eq} from 'drizzle-orm';

/**
 * Ingests Daniel Jeremiah's 2018 Final Top 50.
 */

const DIRECT_URL = process.env.DIRECT_URL;
if (!DIRECT_URL) {
  console.error('DIRECT_URL is required');
  process.exit(1);
}

const client = postgres(DIRECT_URL, {max: 1});
const db = drizzle(client);

const DJ_2018_TOP50 = [
  {rank: 1, player: 'Saquon Barkley'},
  {rank: 2, player: 'Quenton Nelson'},
  {rank: 3, player: 'Tremaine Edmunds'},
  {rank: 4, player: 'Bradley Chubb'},
  {rank: 5, player: 'Minkah Fitzpatrick'},
  {rank: 6, player: 'Sam Darnold'},
  {rank: 7, player: 'Josh Rosen'},
  {rank: 8, player: 'Denzel Ward'},
  {rank: 9, player: 'Derwin James'},
  {rank: 10, player: 'Vita Vea'},
  {rank: 11, player: 'Roquan Smith'},
  {rank: 12, player: 'Marcus Davenport'},
  {rank: 13, player: 'Baker Mayfield'},
  {rank: 14, player: 'Josh Allen'},
  {rank: 15, player: "Da'Ron Payne"},
  {rank: 16, player: 'Jaire Alexander'},
  {rank: 17, player: 'Derrius Guice'},
  {rank: 18, player: 'Mike Hughes'},
  {rank: 19, player: 'Rashaan Evans'},
  {rank: 20, player: 'Ronald Jones II'},
  {rank: 21, player: 'Connor Williams'},
  {rank: 22, player: 'Calvin Ridley'},
  {rank: 23, player: 'James Daniels'},
  {rank: 24, player: 'Taven Bryan'},
  {rank: 25, player: 'Will Hernandez'},
  {rank: 26, player: 'Sony Michel'},
  {rank: 27, player: 'Josh Jackson'},
  {rank: 28, player: 'Donte Jackson'},
  {rank: 29, player: 'Christian Kirk'},
  {rank: 30, player: 'Jessie Bates'},
  {rank: 31, player: 'Hayden Hurst'},
  {rank: 32, player: 'Leighton Vander Esch'},
  {rank: 33, player: 'Harrison Phillips'},
  {rank: 34, player: 'Maurice Hurst'},
  {rank: 35, player: 'Mike McGlinchey'},
  {rank: 36, player: 'Isaiah Oliver'},
  {rank: 37, player: 'Isaiah Wynn'},
  {rank: 38, player: 'Ronnie Harrison'},
  {rank: 39, player: 'Harold Landry'},
  {rank: 40, player: 'Tyrell Crosby'},
  {rank: 41, player: 'Lamar Jackson'},
  {rank: 42, player: 'B.J. Hill'},
  {rank: 43, player: 'Dallas Goedert'},
  {rank: 44, player: 'Nick Chubb'},
  {rank: 45, player: 'D.J. Moore'},
  {rank: 46, player: 'Frank Ragnow'},
  {rank: 47, player: 'Kolton Miller'},
  {rank: 48, player: 'Justin Reid'},
  {rank: 49, player: 'Uchenna Nwosu'},
  {rank: 50, player: 'Kerryon Johnson'},
];

async function ingest() {
  const dj = (await db.select().from(experts).where(eq(experts.slug, 'dj')).limit(1))[0];
  if (!dj) {throw new Error('Expert DJ not found.');}

  console.log(`Ingesting ${DJ_2018_TOP50.length} rankings for Daniel Jeremiah (2018)...`);

  for (const p of DJ_2018_TOP50) {
    await db.insert(expertRankings).values({
      expertId: dj.id,
      year: 2018,
      playerName: p.player,
      rank: p.rank,
      grade: 'A',
      commentary: `Ranked #${p.rank} overall by DJ in 2018 final board.`,
    });
  }

  console.log('Ingestion complete.');
}

ingest()
  .catch(console.error)
  .finally(() => client.end());
