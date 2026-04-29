import {drizzle} from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import {expertRankings, experts} from '../src/db/schema.js';
import {eq} from 'drizzle-orm';

/**
 * Ingests Dane Brugler's 2023 Final Top 50 ("The Beast").
 */

const DIRECT_URL = process.env.DIRECT_URL;
if (!DIRECT_URL) {
  console.error('DIRECT_URL is required');
  process.exit(1);
}

const client = postgres(DIRECT_URL, {max: 1});
const db = drizzle(client);

const BRUGLER_2023_TOP50 = [
  {rank: 1, player: 'Bryce Young', pos: 'QB', school: 'Alabama'},
  {rank: 2, player: 'Will Anderson Jr.', pos: 'EDGE', school: 'Alabama'},
  {rank: 3, player: 'Jalen Carter', pos: 'DT', school: 'Georgia'},
  {rank: 4, player: 'Bijan Robinson', pos: 'RB', school: 'Texas'},
  {rank: 5, player: 'Tyree Wilson', pos: 'EDGE', school: 'Texas Tech'},
  {rank: 6, player: 'Devon Witherspoon', pos: 'CB', school: 'Illinois'},
  {rank: 7, player: 'C.J. Stroud', pos: 'QB', school: 'Ohio State'},
  {rank: 8, player: 'Christian Gonzalez', pos: 'CB', school: 'Oregon'},
  {rank: 9, player: 'Paris Johnson Jr.', pos: 'OT', school: 'Ohio State'},
  {rank: 10, player: 'Peter Skoronski', pos: 'OT', school: 'Northwestern'},
  {rank: 11, player: 'Anthony Richardson', pos: 'QB', school: 'Florida'},
  {rank: 12, player: 'Nolan Smith', pos: 'EDGE', school: 'Georgia'},
  {rank: 13, player: 'Myles Murphy', pos: 'EDGE', school: 'Clemson'},
  {rank: 14, player: 'Lukas Van Ness', pos: 'EDGE', school: 'Iowa'},
  {rank: 15, player: 'Will Levis', pos: 'QB', school: 'Kentucky'},
  {rank: 16, player: 'Jaxon Smith-Njigba', pos: 'WR', school: 'Ohio State'},
  {rank: 17, player: 'Broderick Jones', pos: 'OT', school: 'Georgia'},
  {rank: 18, player: 'Joey Porter Jr.', pos: 'CB', school: 'Penn State'},
  {rank: 19, player: 'Calijah Kancey', pos: 'DT', school: 'Pittsburgh'},
  {rank: 20, player: 'Deonte Banks', pos: 'CB', school: 'Maryland'},
  {rank: 21, player: 'Jahmyr Gibbs', pos: 'RB', school: 'Alabama'},
  {rank: 22, player: 'Jordan Addison', pos: 'WR', school: 'USC'},
  {rank: 23, player: 'Zay Flowers', pos: 'WR', school: 'Boston College'},
  {rank: 24, player: 'Michael Mayer', pos: 'TE', school: 'Notre Dame'},
  {rank: 25, player: 'Quentin Johnston', pos: 'WR', school: 'TCU'},
  {rank: 26, player: 'Brian Branch', pos: 'S', school: 'Alabama'},
  {rank: 27, player: 'Luke Musgrave', pos: 'TE', school: 'Oregon State'},
  {rank: 28, player: 'Darnell Wright', pos: 'OT', school: 'Tennessee'},
  {rank: 29, player: 'Darnell Washington', pos: 'TE', school: 'Georgia'},
  {rank: 30, player: 'Dalton Kincaid', pos: 'TE', school: 'Utah'},
  {rank: 31, player: "O'Cyrus Torrence", pos: 'OG', school: 'Florida'},
  {rank: 32, player: 'Emmanuel Forbes', pos: 'CB', school: 'Mississippi State'},
  {rank: 33, player: 'Kelee Ringo', pos: 'CB', school: 'Georgia'},
  {rank: 34, player: 'Will McDonald IV', pos: 'EDGE', school: 'Iowa State'},
  {rank: 35, player: 'Bryan Bresee', pos: 'DT', school: 'Clemson'},
  {rank: 36, player: 'Mazi Smith', pos: 'DT', school: 'Michigan'},
  {rank: 37, player: 'Jack Campbell', pos: 'LB', school: 'Iowa'},
  {rank: 38, player: 'Steve Avila', pos: 'OG', school: 'TCU'},
  {rank: 39, player: 'Cody Mauch', pos: 'OL', school: 'North Dakota State'},
  {rank: 40, player: 'Joe Tippmann', pos: 'C', school: 'Wisconsin'},
  {rank: 41, player: 'Felix Anudike-Uzomah', pos: 'EDGE', school: 'Kansas State'},
  {rank: 42, player: 'Drew Sanders', pos: 'LB', school: 'Arkansas'},
  {rank: 43, player: 'Julius Brents', pos: 'CB', school: 'Kansas State'},
  {rank: 44, player: 'Cam Smith', pos: 'CB', school: 'South Carolina'},
  {rank: 45, player: 'Adetomiwa Adebawore', pos: 'DL', school: 'Northwestern'},
  {rank: 46, player: 'John Michael Schmitz', pos: 'C', school: 'Minnesota'},
  {rank: 47, player: 'Matthew Bergeron', pos: 'OT', school: 'Syracuse'},
  {rank: 48, player: 'Derick Hall', pos: 'EDGE', school: 'Auburn'},
  {rank: 49, player: 'BJ Ojulari', pos: 'EDGE', school: 'LSU'},
  {rank: 50, player: 'Josh Downs', pos: 'WR', school: 'North Carolina'},
];

async function ingest() {
  const expert = (await db.select().from(experts).where(eq(experts.slug, 'brugler')).limit(1))[0];
  if (!expert) {
    throw new Error('Expert Dane Brugler not found.');
  }

  console.log(`Ingesting ${BRUGLER_2023_TOP50.length} rankings for Dane Brugler (2023)...`);

  for (const p of BRUGLER_2023_TOP50) {
    await db.insert(expertRankings).values({
      expertId: expert.id,
      year: 2023,
      playerName: p.player,
      rank: p.rank,
      grade: 'A',
      commentary: `Top 50 from "The Beast" 2023 final board.`,
    });
  }

  console.log('Ingestion complete.');
}

ingest()
  .catch(console.error)
  .finally(() => client.end());
