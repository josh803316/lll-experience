/**
 * Ingest Tim's per-player best-contract percentile from
 * player_contracts_2018_2026-Fewer position categories.xlsx (tab 1).
 *
 * The "Best Contract Once" column (X) is non-blank only on the row that
 * represents the player's single best contract percentile across all years.
 * We filter to those rows so we get one signal per player.
 *
 * "Qualifies non-rookie" = the chosen contract is is_second_contract=true
 * OR signed at least 4 years after the player's draft. Rookie-scale deals
 * are slotted by pick number (no talent signal), so we flag them and let
 * the consumer fall back to PFF-only.
 *
 * Usage:
 *   bun run scripts/ingest-contract-signal.ts [path-to-xlsx]
 */
import * as XLSX from 'xlsx';
import postgres from 'postgres';
import {drizzle} from 'drizzle-orm/postgres-js';
import {sql} from 'drizzle-orm';
import {playerContractSignal} from '../src/db/schema.js';
import {toFranchisePosition} from '../src/services/lll-rating-engine.js';

const DEFAULT_PATH = '/Users/joshnisenson/Downloads/player_contracts_2018_2026-Fewer position categories.xlsx';
const path = process.argv[2] ?? DEFAULT_PATH;

const DIRECT_URL = process.env.DIRECT_URL;
if (!DIRECT_URL) {
  throw new Error('DIRECT_URL is required');
}

const client = postgres(DIRECT_URL, {prepare: false});
const db = drizzle(client);

// Tab 1 column indices (0-based)
const COL = {
  player_name: 0,
  draft_year: 1,
  franchise_position: 6,
  contract_year_signed: 8,
  apy_cap_pct: 14,
  is_second_contract: 15,
  best_contract_once: 23, // Column X
};

const wb = XLSX.readFile(path);
const ws = wb.Sheets['player_contracts_2018_2026'];
if (!ws) {
  throw new Error('Tab "player_contracts_2018_2026" not found');
}

const rows: any[][] = XLSX.utils.sheet_to_json(ws, {header: 1, defval: null});

interface Signal {
  playerName: string;
  franchisePosition: string;
  bestContractPercentile: number;
  bestApyCapPct: number | null;
  bestYearSigned: number;
  qualifiesNonRookie: boolean;
}

const signals: Signal[] = [];
const skipped: Record<string, number> = {};

for (let i = 1; i < rows.length; i++) {
  const r = rows[i];
  if (!r) {
    continue;
  }
  const bestOnce = r[COL.best_contract_once];
  // Filter to rows where Best Contract Once is non-blank — those mark a player's single best
  if (bestOnce === null || bestOnce === undefined || bestOnce === '') {
    continue;
  }
  const pct = typeof bestOnce === 'number' ? bestOnce : Number(bestOnce);
  if (!Number.isFinite(pct)) {
    skipped['non_numeric_pct'] = (skipped['non_numeric_pct'] ?? 0) + 1;
    continue;
  }
  const playerName = r[COL.player_name];
  if (!playerName || typeof playerName !== 'string') {
    skipped['missing_player'] = (skipped['missing_player'] ?? 0) + 1;
    continue;
  }
  const franchiseRaw = r[COL.franchise_position];
  const franchise = toFranchisePosition(typeof franchiseRaw === 'string' ? franchiseRaw : null);
  if (!franchise) {
    skipped[`unmapped_pos_${franchiseRaw}`] = (skipped[`unmapped_pos_${franchiseRaw}`] ?? 0) + 1;
    continue;
  }
  const yearSigned = Number(r[COL.contract_year_signed]);
  if (!Number.isFinite(yearSigned)) {
    skipped['missing_year'] = (skipped['missing_year'] ?? 0) + 1;
    continue;
  }
  const draftYear = Number(r[COL.draft_year]);
  const isSecond = r[COL.is_second_contract];
  const isSecondBool = isSecond === true || isSecond === 'true' || isSecond === 'TRUE';
  const apyCapRaw = r[COL.apy_cap_pct];
  const bestApyCapPct =
    typeof apyCapRaw === 'number' ? apyCapRaw : Number.isFinite(Number(apyCapRaw)) ? Number(apyCapRaw) : null;
  const qualifies = isSecondBool || (Number.isFinite(draftYear) && yearSigned - draftYear >= 4);

  signals.push({
    playerName: playerName.trim(),
    franchisePosition: franchise,
    bestContractPercentile: pct,
    bestApyCapPct,
    bestYearSigned: yearSigned,
    qualifiesNonRookie: qualifies,
  });
}

await db.execute(sql`TRUNCATE TABLE player_contract_signal`);

for (let i = 0; i < signals.length; i += 500) {
  const chunk = signals.slice(i, i + 500);
  await db.insert(playerContractSignal).values(chunk).onConflictDoNothing();
}

console.log(`Inserted ${signals.length} player contract signals`);
console.log(`  qualifying non-rookie: ${signals.filter((s) => s.qualifiesNonRookie).length}`);
console.log(`  rookie-only:           ${signals.filter((s) => !s.qualifiesNonRookie).length}`);
if (Object.keys(skipped).length > 0) {
  console.log('Skipped:');
  for (const [k, v] of Object.entries(skipped)) {
    console.log(`  ${k}: ${v}`);
  }
}

await client.end();
