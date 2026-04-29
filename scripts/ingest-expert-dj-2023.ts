import {drizzle} from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import {expertRankings, experts} from '../src/db/schema.js';
import {eq} from 'drizzle-orm';

/**
 * Ingests Daniel Jeremiah's 2023 Final Top 50.
 * This is used to test the "Oracle" and "Scout" accuracy models.
 */

const DIRECT_URL = process.env.DIRECT_URL;
if (!DIRECT_URL) {
  console.error('DIRECT_URL is required');
  process.exit(1);
}

const client = postgres(DIRECT_URL, {max: 1});
const db = drizzle(client);

const DJ_2023_TOP50 = [
  {rank: 1, player: 'Bryce Young', pos: 'QB', school: 'Alabama'},
  {rank: 2, player: 'Will Anderson Jr.', pos: 'EDGE', school: 'Alabama'},
  {rank: 3, player: 'Bijan Robinson', pos: 'RB', school: 'Texas'},
  {rank: 4, player: 'Tyree Wilson', pos: 'EDGE', school: 'Texas Tech'},
  {rank: 5, player: 'Devon Witherspoon', pos: 'CB', school: 'Illinois'},
  {rank: 6, player: 'Jalen Carter', pos: 'DT', school: 'Georgia'},
  {rank: 7, player: 'C.J. Stroud', pos: 'QB', school: 'Ohio State'},
  {rank: 8, player: 'Peter Skoronski', pos: 'OL', school: 'Northwestern'},
  {rank: 9, player: 'Dalton Kincaid', pos: 'TE', school: 'Utah'},
  {rank: 10, player: 'Christian Gonzalez', pos: 'CB', school: 'Oregon'},
  {rank: 11, player: 'Lukas Van Ness', pos: 'EDGE', school: 'Iowa'},
  {rank: 12, player: 'Paris Johnson Jr.', pos: 'OT', school: 'Ohio State'},
  {rank: 13, player: 'Nolan Smith', pos: 'EDGE', school: 'Georgia'},
  {rank: 14, player: 'Jordan Addison', pos: 'WR', school: 'USC'},
  {rank: 15, player: 'Anthony Richardson', pos: 'QB', school: 'Florida'},
  {rank: 16, player: 'Myles Murphy', pos: 'EDGE', school: 'Clemson'},
  {rank: 17, player: 'Broderick Jones', pos: 'OT', school: 'Georgia'},
  {rank: 18, player: 'Darnell Wright', pos: 'OT', school: 'Tennessee'},
  {rank: 19, player: 'Will McDonald IV', pos: 'EDGE', school: 'Iowa State'},
  {rank: 20, player: 'Michael Mayer', pos: 'TE', school: 'Notre Dame'},
  {rank: 21, player: 'Jaxon Smith-Njigba', pos: 'WR', school: 'Ohio State'},
  {rank: 22, player: 'Zay Flowers', pos: 'WR', school: 'Boston College'},
  {rank: 23, player: 'Quentin Johnston', pos: 'WR', school: 'TCU'},
  {rank: 24, player: 'Brian Branch', pos: 'S', school: 'Alabama'},
  {rank: 25, player: 'Calijah Kancey', pos: 'DT', school: 'Pitt'},
  {rank: 26, player: 'Keion White', pos: 'EDGE', school: 'Georgia Tech'},
  {rank: 27, player: 'Emmanuel Forbes', pos: 'CB', school: 'Mississippi State'},
  {rank: 28, player: 'Joey Porter Jr.', pos: 'CB', school: 'Penn State'},
  {rank: 29, player: 'Jahmyr Gibbs', pos: 'RB', school: 'Alabama'},
  {rank: 30, player: 'Deonte Banks', pos: 'CB', school: 'Maryland'},
  {rank: 31, player: 'Felix Anudike-Uzomah', pos: 'EDGE', school: 'Kansas State'},
  {rank: 32, player: 'Mazi Smith', pos: 'DT', school: 'Michigan'},
  {rank: 33, player: 'Darnell Washington', pos: 'TE', school: 'Georgia'},
  {rank: 34, player: 'Julius Brents', pos: 'CB', school: 'Kansas State'},
  {rank: 35, player: 'Cam Smith', pos: 'CB', school: 'South Carolina'},
  {rank: 36, player: 'Luke Musgrave', pos: 'TE', school: 'Oregon State'},
  {rank: 37, player: 'Steve Avila', pos: 'IOL', school: 'TCU'},
  {rank: 38, player: 'Joe Tippmann', pos: 'IOL', school: 'Wisconsin'},
  {rank: 39, player: 'Sam LaPorta', pos: 'TE', school: 'Iowa'},
  {rank: 40, player: 'Keeanu Benton', pos: 'DT', school: 'Wisconsin'},
  {rank: 41, player: "O'Cyrus Torrence", pos: 'IOL', school: 'Florida'},
  {rank: 42, player: 'BJ Ojulari', pos: 'EDGE', school: 'LSU'},
  {rank: 43, player: 'Drew Sanders', pos: 'LB', school: 'Arkansas'},
  {rank: 44, player: 'Jack Campbell', pos: 'LB', school: 'Iowa'},
  {rank: 45, player: 'Will Levis', pos: 'QB', school: 'Kentucky'},
  {rank: 46, player: 'Tuli Tuipulotu', pos: 'EDGE', school: 'USC'},
  {rank: 47, player: 'Matthew Bergeron', pos: 'OT', school: 'Syracuse'},
  {rank: 48, player: 'Hendon Hooker', pos: 'QB', school: 'Tennessee'},
  {rank: 49, player: 'Adetomiwa Adebawore', pos: 'DL', school: 'Northwestern'},
  {rank: 50, player: 'Derick Hall', pos: 'EDGE', school: 'Auburn'},
];

async function ingest() {
  const dj = (await db.select().from(experts).where(eq(experts.slug, 'dj')).limit(1))[0];
  if (!dj) {
    throw new Error('Expert Daniel Jeremiah not found. Run seed-experts-v2.ts first.');
  }

  console.log(`Ingesting ${DJ_2023_TOP50.length} rankings for Daniel Jeremiah (2023)...`);

  for (const p of DJ_2023_TOP50) {
    await db.insert(expertRankings).values({
      expertId: dj.id,
      year: 2023,
      playerName: p.player,
      rank: p.rank,
      grade: 'A', // DJ's Top 50 are usually considered his "A" tier/First round grades
      commentary: `Ranked #${p.rank} overall by DJ in 2023 final big board.`,
    });
  }

  console.log('Ingestion complete.');
}

ingest()
  .catch(console.error)
  .finally(() => client.end());
