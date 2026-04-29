import {drizzle} from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import {officialDraftResults, expertRankings, experts, apps} from '../src/db/schema.js';
import {eq, and} from 'drizzle-orm';

/**
 * Data Import Tool for LLL Draft Analyzer
 * This script handles bulk ingestion of historical draft picks and expert grades.
 */

const DIRECT_URL = process.env.DIRECT_URL;
if (!DIRECT_URL) {
  console.error('DIRECT_URL is required');
  process.exit(1);
}

const client = postgres(DIRECT_URL, {max: 1});
const db = drizzle(client);

async function importHistoricalData(payload: {
  officialPicks?: any[];
  expertGrades?: {expertSlug: string; year: number; picks: any[]}[];
}) {
  const app = (await db.select().from(apps).where(eq(apps.slug, 'analyzer')).limit(1))[0];
  if (!app) {
    throw new Error('Analyzer app not found. Seed the app first.');
  }

  // 1. Import Official Draft Results
  if (payload.officialPicks) {
    console.log(`Importing ${payload.officialPicks.length} official picks...`);
    for (const p of payload.officialPicks) {
      await db
        .insert(officialDraftResults)
        .values({
          appId: app.id,
          year: p.year,
          round: p.round,
          pickNumber: p.pick,
          playerName: p.player,
          teamName: p.team,
          position: p.pos,
          college: p.college,
        })
        .onConflictDoNothing();
    }
  }

  // 2. Import Expert Grades
  if (payload.expertGrades) {
    for (const group of payload.expertGrades) {
      const expert = (await db.select().from(experts).where(eq(experts.slug, group.expertSlug)).limit(1))[0];
      if (!expert) {
        console.warn(`Expert ${group.expertSlug} not found, skipping...`);
        continue;
      }

      console.log(`Importing ${group.picks.length} grades for ${expert.name} (${group.year})...`);
      for (const p of group.picks) {
        await db.insert(expertRankings).values({
          expertId: expert.id,
          year: group.year,
          playerName: p.player,
          rank: p.rank,
          grade: p.grade,
          commentary: p.commentary,
        });
      }
    }
  }

  console.log('Import task complete.');
}

// Example usage structure for 10-year data:
const EXAMPLE_PAYLOAD = {
  officialPicks: [
    {year: 2023, round: 1, pick: 1, player: 'Bryce Young', team: 'CAR', pos: 'QB', college: 'Alabama'},
    // ... add more here
  ],
  expertGrades: [
    {
      expertSlug: 'dj',
      year: 2023,
      picks: [{player: 'Bryce Young', rank: 1, grade: 'A+', commentary: 'Elite processor.'}],
    },
  ],
};

// We will export this so we can call it from a data-loading process
export {importHistoricalData};

if (process.argv[1].includes('import-draft-history.ts')) {
  // Run example or actual data here
  console.log('To use this script, populate it with data from PFR or Mock Draft Database.');
  client.end();
}
