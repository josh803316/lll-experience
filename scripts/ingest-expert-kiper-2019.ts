import {drizzle} from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import {expertRankings, experts} from '../src/db/schema.js';
import {eq} from 'drizzle-orm';

/**
 * Ingests Mel Kiper Jr.'s 2019 Final Big Board Top 25.
 */

const DIRECT_URL = process.env.DIRECT_URL;
if (!DIRECT_URL) {
  console.error('DIRECT_URL is required');
  process.exit(1);
}

const client = postgres(DIRECT_URL, {max: 1});
const db = drizzle(client);

const KIPER_2019_TOP25 = [
  { rank: 1, player: 'Nick Bosa' },
  { rank: 2, player: 'Quinnen Williams' },
  { rank: 3, player: 'Josh Allen' },
  { rank: 4, player: 'Devin White' },
  { rank: 5, player: 'Ed Oliver' },
  { rank: 6, player: 'T.J. Hockenson' },
  { rank: 7, player: 'Devin Bush' },
  { rank: 8, player: 'Brian Burns' },
  { rank: 9, player: 'Jonah Williams' },
  { rank: 10, player: 'Christian Wilkins' },
  { rank: 11, player: 'Jawaan Taylor' },
  { rank: 12, player: 'Andre Dillard' },
  { rank: 13, player: 'Rashan Gary' },
  { rank: 14, player: 'Kyler Murray' },
  { rank: 15, player: 'Dwayne Haskins' },
  { rank: 16, player: 'Clelin Ferrell' },
  { rank: 17, player: 'Garrett Bradbury' },
  { rank: 18, player: 'Montez Sweat' },
  { rank: 19, player: 'Byron Murphy' },
  { rank: 20, player: 'Noah Fant' },
  { rank: 21, player: 'Chris Lindstrom' },
  { rank: 22, player: 'Marquise Brown' },
  { rank: 23, player: 'Drew Lock' },
  { rank: 24, player: 'Cody Ford' },
  { rank: 25, player: 'Dexter Lawrence' }
];

async function ingest() {
  const expert = (await db.select().from(experts).where(eq(experts.slug, 'kiper')).limit(1))[0];
  if (!expert) throw new Error('Expert Kiper not found.');

  console.log(`Ingesting ${KIPER_2019_TOP25.length} rankings for Mel Kiper Jr. (2019)...`);

  for (const p of KIPER_2019_TOP25) {
    await db.insert(expertRankings).values({
      expertId: expert.id,
      year: 2019,
      playerName: p.player,
      rank: p.rank,
      grade: 'A',
      commentary: `Top 25 from Kiper's final 2019 Big Board.`
    });
  }

  console.log('Ingestion complete.');
}

ingest().catch(console.error).finally(() => client.end());
