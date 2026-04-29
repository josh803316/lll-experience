/**
 * Apply curated contract overrides for picks neither nflverse (≤ 2022)
 * nor Spotrac (current rosters) captured. The overrides JSON is hand-
 * maintained — see scripts/contract-overrides.json.
 *
 * Run: bun run scripts/apply-contract-overrides.ts
 */

import {drizzle} from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import {officialDraftResults} from '../src/db/schema.js';
import {eq, sql} from 'drizzle-orm';
import {LLLRatingEngine} from '../src/services/lll-rating-engine.js';
import {CONTRACT_OVERRIDES, type ContractOverride} from './contract-overrides.js';

const DIRECT_URL = process.env.DIRECT_URL;
if (!DIRECT_URL) {
  console.error('DIRECT_URL is required');
  process.exit(1);
}
const client = postgres(DIRECT_URL, {prepare: false});
const db = drizzle(client);

const NFL_CAP_BY_YEAR: Record<number, number> = {
  2015: 143.28,
  2016: 155.27,
  2017: 167.0,
  2018: 177.2,
  2019: 188.2,
  2020: 198.2,
  2021: 182.5,
  2022: 208.2,
  2023: 224.8,
  2024: 255.4,
  2025: 279.2,
  2026: 305.5,
};

async function run() {
  console.log(`Loaded ${Object.keys(CONTRACT_OVERRIDES).length} overrides`);

  // Build a lookup keyed by normalized name (canonical + aliases).
  const byNorm = new Map<string, {primaryName: string; ovr: ContractOverride}>();
  for (const [name, ovr] of Object.entries(CONTRACT_OVERRIDES)) {
    byNorm.set(LLLRatingEngine.normalizeName(name), {primaryName: name, ovr});
    for (const alias of ovr.aliases ?? []) {
      byNorm.set(LLLRatingEngine.normalizeName(alias), {primaryName: name, ovr});
    }
  }

  let touched = 0;
  let skipped = 0;
  const counts: Record<string, number> = {};

  // Pull every pick that has matching name or alias.
  const allPicks = await db.select().from(officialDraftResults);
  for (const pick of allPicks) {
    if (!pick.playerName) {
      continue;
    }
    const norm = LLLRatingEngine.normalizeName(pick.playerName);
    const hit = byNorm.get(norm);
    if (!hit) {
      continue;
    }
    const ovr = hit.ovr;

    // Compute APY-as-cap-pct for the start year.
    const cap = NFL_CAP_BY_YEAR[ovr.startYear] ?? 250;
    const apyCapPct = ovr.apy > 0 ? ovr.apy / 1_000_000 / cap : 0;

    let outcome: string;
    if (apyCapPct >= 0.1) {
      outcome = ovr.isSameTeam ? 'TOP_OF_MARKET' : 'OTHER_TEAM_PAID';
    } else if (apyCapPct >= 0.05) {
      outcome = ovr.isSameTeam ? 'MARKET_OR_ABOVE' : 'OTHER_TEAM_PAID';
    } else if (apyCapPct >= 0.02) {
      outcome = ovr.isSameTeam ? 'MARKET_OR_ABOVE' : 'OTHER_TEAM_PAID';
    } else {
      outcome = 'WALKED_FOR_CHEAP';
    }

    if (pick.contractOutcome === outcome) {
      skipped++;
      continue;
    }
    await db.update(officialDraftResults).set({contractOutcome: outcome}).where(eq(officialDraftResults.id, pick.id));
    counts[outcome] = (counts[outcome] ?? 0) + 1;
    touched++;
    console.log(
      `  ${hit.primaryName.padEnd(25)} → ${outcome} (was ${pick.contractOutcome ?? 'none'}, ${(apyCapPct * 100).toFixed(1)}% cap, ${ovr.signingTeamAbbr}, sameTeam=${ovr.isSameTeam})`,
    );
  }

  console.log(`\nUpdated ${touched} rows, ${skipped} already correct.`);
  console.log('Outcome distribution:', counts);

  // Final coverage check.
  const evalYear = new Date().getFullYear();
  const cutoffYear = evalYear - 4;
  const [eligible] = await db
    .select({c: sql<number>`COUNT(*)::int`})
    .from(officialDraftResults)
    .where(sql`year <= ${cutoffYear}`);
  const [withOutcome] = await db
    .select({c: sql<number>`COUNT(*)::int`})
    .from(officialDraftResults)
    .where(sql`year <= ${cutoffYear} AND contract_outcome IS NOT NULL`);
  console.log(
    `Coverage: ${withOutcome.c} / ${eligible.c} eligible (${((withOutcome.c / eligible.c) * 100).toFixed(1)}%)`,
  );
}

run()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => client.end());
