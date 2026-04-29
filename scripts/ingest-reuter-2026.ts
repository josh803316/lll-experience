import {drizzle} from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import {experts, expertTeamGrades} from '../src/db/schema.js';
import {eq} from 'drizzle-orm';

const DIRECT_URL = process.env.DIRECT_URL;
if (!DIRECT_URL) {
  console.error('DIRECT_URL is required');
  process.exit(1);
}

const client = postgres(DIRECT_URL, {max: 1});
const db = drizzle(client);

const CHAD_REUTER_GRADES = [
  {team: 'Buffalo Bills', grade: 'A'},
  {team: 'Miami Dolphins', grade: 'B'},
  {team: 'New England Patriots', grade: 'B+'},
  {team: 'New York Jets', grade: 'B+'},
  {team: 'Baltimore Ravens', grade: 'B+'},
  {team: 'Cincinnati Bengals', grade: 'B'},
  {team: 'Cleveland Browns', grade: 'A-'},
  {team: 'Pittsburgh Steelers', grade: 'A-'},
  {team: 'Houston Texans', grade: 'B'},
  {team: 'Indianapolis Colts', grade: 'B'},
  {team: 'Jacksonville Jaguars', grade: 'B'},
  {team: 'Tennessee Titans', grade: 'A-'},
  {team: 'Denver Broncos', grade: 'A-'},
  {team: 'Kansas City Chiefs', grade: 'A-'},
  {team: 'Las Vegas Raiders', grade: 'A-'},
  {team: 'Los Angeles Chargers', grade: 'B'},
  {team: 'Dallas Cowboys', grade: 'B+'},
  {team: 'New York Giants', grade: 'B+'},
  {team: 'Philadelphia Eagles', grade: 'B+'},
  {team: 'Washington Commanders', grade: 'B'},
  {team: 'Chicago Bears', grade: 'A-'},
  {team: 'Detroit Lions', grade: 'A-'},
  {team: 'Green Bay Packers', grade: 'B+'},
  {team: 'Minnesota Vikings', grade: 'B'},
  {team: 'Atlanta Falcons', grade: 'B-'},
  {team: 'Carolina Panthers', grade: 'A-'},
  {team: 'New Orleans Saints', grade: 'B+'},
  {team: 'Tampa Bay Buccaneers', grade: 'A-'},
  {team: 'Arizona Cardinals', grade: 'A'},
  {team: 'Los Angeles Rams', grade: 'B+'},
  {team: 'San Francisco 49ers', grade: 'A-'},
  {team: 'Seattle Seahawks', grade: 'B+'},
];

async function ingest() {
  console.log('--- Ingesting Chad Reuter 2026 Team Grades ---');

  // 1. Ensure Chad Reuter is an expert
  let chad = (await db.select().from(experts).where(eq(experts.slug, 'chad-reuter')).limit(1))[0];
  if (!chad) {
    console.log('Adding Chad Reuter to experts...');
    const result = await db
      .insert(experts)
      .values({
        slug: 'chad-reuter',
        name: 'Chad Reuter',
        organization: 'NFL.com',
        bio: 'Draft Analyst for NFL.com, known for detailed multi-round grades.',
      })
      .returning();
    chad = result[0];
  }

  // 2. Ingest Grades
  console.log(`Ingesting ${CHAD_REUTER_GRADES.length} team grades...`);
  for (const g of CHAD_REUTER_GRADES) {
    await db.insert(expertTeamGrades).values({
      expertId: chad.id,
      year: 2026,
      teamName: g.team,
      grade: g.grade,
      commentary: `Post-draft snap grade from Chad Reuter (NFL.com) for the 2026 class.`,
    });
  }

  console.log('Ingestion complete.');
}

ingest()
  .catch(console.error)
  .finally(() => client.end());
