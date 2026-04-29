import {drizzle} from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import {officialDraftResults, apps} from '../src/db/schema.js';
import {eq} from 'drizzle-orm';
import {readFileSync} from 'fs';
import {join} from 'path';

/**
 * Contract Ingestion Tool (Local File Version)
 * Source: OverTheCap via nflverse
 */

const CSV_PATH = join(process.cwd(), 'scripts', 'historical_contracts.csv');

const DIRECT_URL = process.env.DIRECT_URL;
if (!DIRECT_URL) {
  console.error('DIRECT_URL is required');
  process.exit(1);
}

const client = postgres(DIRECT_URL, {max: 1});
const db = drizzle(client);

async function runContractIngestion() {
  console.log('--- Reading Local Contract Data ---');
  
  const csvText = readFileSync(CSV_PATH, 'utf-8');
  const lines = csvText.split('\n');
  const headers = lines[0].split(',');
  
  const h = {
    player: headers.indexOf('player'),
    team: headers.indexOf('team'),
    year_signed: headers.indexOf('year_signed'),
    apy_cap_pct: headers.indexOf('apy_cap_pct'),
    draft_year: headers.indexOf('draft_year'),
    draft_overall: headers.indexOf('draft_overall')
  };

  console.log(`Processing ${lines.length - 1} contracts...`);

  const playerContracts: Record<string, any[]> = {};

  for (let i = 1; i < lines.length; i++) {
    const row = lines[i].split(',');
    if (row.length < headers.length) continue;

    const name = row[h.player]?.replace(/"/g, '').trim();
    if (!name) continue;

    if (!playerContracts[name]) playerContracts[name] = [];
    playerContracts[name].push({
      year: parseInt(row[h.year_signed]),
      apyCapPct: parseFloat(row[h.apy_cap_pct]) || 0,
      team: row[h.team]?.trim(),
      draftYear: parseInt(row[h.draft_year]),
      draftOverall: parseInt(row[h.draft_overall])
    });
  }

  console.log('Mapping contracts to drafted players in database...');

  const allDrafted = await db.select().from(officialDraftResults);
  let updatedCount = 0;

  for (const pick of allDrafted) {
    if (!pick.playerName) continue;
    
    // Normalize names for better matching
    const searchName = pick.playerName.trim();
    const contracts = playerContracts[searchName];
    
    // We also check for fuzzy matching or other variations if needed, but exact first
    if (!contracts) continue;

    // Sort by year
    contracts.sort((a, b) => a.year - b.year);
    
    // identify the rookie deal. usually signed in their draft year.
    const rookieIndex = contracts.findIndex(c => c.year === pick.year);
    if (rookieIndex === -1 && contracts.length === 0) continue;

    // The second contract is the one after the rookie deal
    // Some players might have multiple "1-year" deals.
    // We want the first "real" second contract.
    const second = contracts.find(c => c.year > pick.year + 2); // At least 3 years after draft

    if (!second) continue;

    // Determine the "Market Signal"
    let outcome = 'WALKED_FOR_CHEAP';
    
    // Check if team name matches (PFR abbreviations might differ from OTC)
    // Common: 'Packers' vs 'GB', 'Bills' vs 'BUF'
    // We'll do a simple includes check or mapping
    const originalTeam = pick.teamName || '';
    const sameTeam = second.team.includes(originalTeam) || originalTeam.includes(second.team);
    
    const capPct = second.apyCapPct;

    if (capPct > 0.08) { // > 8% of cap is huge
      outcome = sameTeam ? 'TOP_OF_MARKET' : 'OTHER_TEAM_PAID';
    } else if (capPct > 0.03) { // > 3% is solid starter
      outcome = sameTeam ? 'MARKET_OR_ABOVE' : 'OTHER_TEAM_PAID';
    } else {
      outcome = sameTeam ? 'MARKET_OR_ABOVE' : 'OTHER_TEAM_PAID'; // Still got paid
    }

    await db.update(officialDraftResults)
      .set({ contractOutcome: outcome })
      .where(eq(officialDraftResults.id, pick.id));
    
    updatedCount++;
    if (updatedCount % 100 === 0) console.log(`Updated ${updatedCount} players...`);
  }

  console.log(`--- Ingestion Complete! Updated ${updatedCount} players with market signals ---`);
}

runContractIngestion().catch(console.error).finally(() => client.end());
