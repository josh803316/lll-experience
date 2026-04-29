import {drizzle} from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import {officialDraftResults, playerPerformanceRatings, apps} from '../src/db/schema.js';
import {eq} from 'drizzle-orm';

/**
 * LLL Automated Ingestion Tool
 * Source: nflverse (Pro Football Reference derived)
 * Fetches 10+ years of draft data and career AV scores.
 */

const CSV_URL = 'https://github.com/nflverse/nflverse-data/releases/download/draft_picks/draft_picks.csv';
const START_YEAR = 2015;

const DIRECT_URL = process.env.DIRECT_URL;
if (!DIRECT_URL) {
  console.error('DIRECT_URL is required');
  process.exit(1);
}

const client = postgres(DIRECT_URL, {max: 1});
const db = drizzle(client);

async function runIngestion() {
  console.log(`--- Starting nflverse Ingestion (Window: ${START_YEAR}+) ---`);

  const app = (await db.select().from(apps).where(eq(apps.slug, 'analyzer')).limit(1))[0];
  if (!app) {
    throw new Error('Analyzer app not found. Run seed-analyzer.ts first.');
  }

  console.log('Fetching raw CSV from nflverse...');
  const response = await fetch(CSV_URL);
  const csvText = await response.text();

  const lines = csvText.split('\n');
  const headers = lines[0].split(',');

  // Find column indices
  const h = {
    season: headers.indexOf('season'),
    round: headers.indexOf('round'),
    pick: headers.indexOf('pick'),
    team: headers.indexOf('team'),
    player: headers.indexOf('pfr_player_name'),
    pos: headers.indexOf('position'),
    college: headers.indexOf('college'),
    w_av: headers.indexOf('w_av'), // Weighted Career Approximate Value
  };

  let importedCount = 0;
  console.log(`Processing ${lines.length - 1} records...`);

  for (let i = 1; i < lines.length; i++) {
    const row = lines[i].split(',');
    if (row.length < headers.length) {
      continue;
    }

    const year = parseInt(row[h.season]);
    if (year < START_YEAR) {
      continue;
    }

    const playerName = row[h.player]?.replace(/"/g, '');
    if (!playerName) {
      continue;
    }

    const round = parseInt(row[h.round]);
    const pick = parseInt(row[h.pick]);
    const wav = parseFloat(row[h.w_av]) || 0;

    // 1. Insert into Official Results
    await db
      .insert(officialDraftResults)
      .values({
        appId: app.id,
        year: year,
        round: round,
        pickNumber: pick,
        playerName: playerName,
        teamName: row[h.team],
        position: row[h.pos],
        college: row[h.college],
      })
      .onConflictDoNothing();

    // 2. Generate a baseline "Career Rating" based on Weighted AV
    // nflverse w_av ranges roughly from 0 to 150 (for legends like Brady).
    // Most solid starters are 30-60.
    // Let's map 0-80 to our 0-10 scale for a rough baseline.
    const lllCareerBaseline = Math.min(10, Number((wav / 8).toFixed(1)));

    await db
      .insert(playerPerformanceRatings)
      .values({
        playerName: playerName,
        draftYear: year,
        evaluationYear: 2025, // Current aggregate view
        rating: lllCareerBaseline,
        isCareerRating: true,
        justification: `Automated baseline via nflverse w_av (${wav})`,
        metadata: {wav: wav},
      })
      .onConflictDoNothing();

    importedCount++;
    if (importedCount % 100 === 0) {
      console.log(`Imported ${importedCount} players...`);
    }
  }

  console.log(`--- Ingestion Complete! Total: ${importedCount} players ---`);
}

runIngestion()
  .catch(console.error)
  .finally(() => client.end());
