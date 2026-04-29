import {drizzle} from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import {expertRankings, experts} from '../src/db/schema.js';
import {eq} from 'drizzle-orm';

/**
 * Ingests Matt Miller's 2024 Final Mock Draft Round 1.
 */

const DIRECT_URL = process.env.DIRECT_URL;
if (!DIRECT_URL) {
  console.error('DIRECT_URL is required');
  process.exit(1);
}

const client = postgres(DIRECT_URL, {max: 1});
const db = drizzle(client);

const MILLER_2024_MOCK = [
  { pick: 1, player: 'Caleb Williams', team: 'CHI' },
  { pick: 2, player: 'Jayden Daniels', team: 'WAS' },
  { pick: 3, player: 'Drake Maye', team: 'NE' },
  { pick: 4, player: 'Marvin Harrison Jr.', team: 'ARI' },
  { pick: 5, player: 'Joe Alt', team: 'LAC' },
  { pick: 6, player: 'Malik Nabers', team: 'NYG' },
  { pick: 7, player: 'JC Latham', team: 'TEN' },
  { pick: 8, player: 'Dallas Turner', team: 'ATL' },
  { pick: 9, player: 'Rome Odunze', team: 'CHI' },
  { pick: 10, player: 'Brock Bowers', team: 'NYJ' },
  { pick: 11, player: 'J.J. McCarthy', team: 'MIN' },
  { pick: 12, player: 'Bo Nix', team: 'DEN' },
  { pick: 13, player: 'Taliese Fuaga', team: 'LV' },
  { pick: 14, player: 'Olu Fashanu', team: 'NO' },
  { pick: 15, player: 'Quinyon Mitchell', team: 'IND' },
  { pick: 16, player: 'Byron Murphy II', team: 'SEA' },
  { pick: 17, player: 'Terrion Arnold', team: 'JAX' },
  { pick: 18, player: 'Amarius Mims', team: 'CIN' },
  { pick: 19, player: 'Laiatu Latu', team: 'LAR' },
  { pick: 20, player: 'Graham Barton', team: 'PIT' },
  { pick: 21, player: 'Jared Verse', team: 'MIA' },
  { pick: 22, player: 'Nate Wiggins', team: 'PHI' },
  { pick: 23, player: 'Chop Robinson', team: 'MIN' },
  { pick: 24, player: 'Tyler Guyton', team: 'DAL' },
  { pick: 25, player: 'Cooper DeJean', team: 'GB' },
  { pick: 26, player: 'Jackson Powers-Johnson', team: 'TB' },
  { pick: 27, player: 'Darius Robinson', team: 'ARI' },
  { pick: 28, player: 'Brian Thomas Jr.', team: 'BUF' },
  { pick: 29, player: 'Kool-Aid McKinstry', team: 'DET' },
  { pick: 30, player: 'Jordan Morgan', team: 'BAL' },
  { pick: 31, player: 'Roger Rosengarten', team: 'SF' },
  { pick: 32, player: 'Xavier Worthy', team: 'KC' }
];

async function ingest() {
  const expert = (await db.select().from(experts).where(eq(experts.slug, 'matt-miller')).limit(1))[0];
  if (!expert) throw new Error('Expert Matt Miller not found.');

  console.log(`Ingesting ${MILLER_2024_MOCK.length} rankings for Matt Miller (2024)...`);

  for (const p of MILLER_2024_MOCK) {
    await db.insert(expertRankings).values({
      expertId: expert.id,
      year: 2024,
      playerName: p.player,
      rank: p.pick,
      grade: 'A', 
      commentary: `Mocked at #${p.pick} to ${p.team} in Miller's final 2024 mock.`
    });
  }

  console.log('Ingestion complete.');
}

ingest().catch(console.error).finally(() => client.end());
