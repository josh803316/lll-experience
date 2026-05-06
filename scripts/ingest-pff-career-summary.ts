/**
 * Ingest Tim's PFF career summary from pff_summary_2016_2025.xlsx into the
 * pff_career_summary table. Uses Column O ("3 good years") on each of the
 * three pivot tabs (Offense, Defense, Special-P-K-LS) as the source of truth.
 *
 * Tim's column-O formula deliberately drops the top season to suppress
 * small-sample anomalies — see schema docstring. We do not re-derive; we
 * import the values directly so we can re-run when the spreadsheet is updated.
 *
 * Usage:
 *   bun run scripts/ingest-pff-career-summary.ts [path-to-xlsx]
 */
import * as XLSX from 'xlsx';
import postgres from 'postgres';
import {drizzle} from 'drizzle-orm/postgres-js';
import {sql} from 'drizzle-orm';
import {pffCareerSummary} from '../src/db/schema.js';
import {toFranchisePosition} from '../src/services/lll-rating-engine.js';

const DEFAULT_PATH = '/Users/joshnisenson/Downloads/pff_summary_2016_2025.xlsx';
const path = process.argv[2] ?? DEFAULT_PATH;

const DIRECT_URL = process.env.DIRECT_URL;
if (!DIRECT_URL) {
  throw new Error('DIRECT_URL is required');
}

const client = postgres(DIRECT_URL, {prepare: false});
const db = drizzle(client);

interface PivotRow {
  position: string;
  pffPlayerId: number | null;
  player: string;
  threeGoodYears: number;
  seasonsCount: number; // # of non-null season cells (D-M)
}

const HEADER_ROW_IDX = 3; // row index 3 is the real header in pivot tabs
const COL_POSITION = 0;
const COL_PLAYER_ID = 1;
const COL_PLAYER = 2;
const COL_YEAR_FIRST = 3; // D = 2016
const COL_YEAR_LAST = 12; // M = 2025
const COL_THREE_GOOD = 14; // Column O

function parsePivotTab(ws: XLSX.WorkSheet): PivotRow[] {
  const rows: any[][] = XLSX.utils.sheet_to_json(ws, {header: 1, defval: null});
  const out: PivotRow[] = [];
  for (let i = HEADER_ROW_IDX + 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r) {
      continue;
    }
    const player = r[COL_PLAYER];
    const position = r[COL_POSITION];
    const tgRaw = r[COL_THREE_GOOD];
    if (!player || typeof player !== 'string' || !position || typeof position !== 'string') {
      continue;
    }
    if (tgRaw == null) {
      continue;
    }
    const tg = typeof tgRaw === 'number' ? tgRaw : Number(tgRaw);
    if (!Number.isFinite(tg)) {
      continue;
    }
    const pid = r[COL_PLAYER_ID];
    let seasonsCount = 0;
    for (let c = COL_YEAR_FIRST; c <= COL_YEAR_LAST; c++) {
      const v = r[c];
      if (v !== null && v !== undefined && Number.isFinite(typeof v === 'number' ? v : Number(v))) {
        seasonsCount++;
      }
    }
    out.push({
      position: position.trim(),
      pffPlayerId: typeof pid === 'number' ? pid : null,
      player: player.trim(),
      threeGoodYears: tg,
      seasonsCount,
    });
  }
  return out;
}

const wb = XLSX.readFile(path);
const tabs: Array<{name: string; side: 'offense' | 'defense' | 'special'}> = [
  {name: 'Offense', side: 'offense'},
  {name: 'Defense', side: 'defense'},
  {name: 'Special-P-K-LS', side: 'special'},
];

await db.execute(sql`TRUNCATE TABLE pff_career_summary`);

let total = 0;
const skippedPositions = new Map<string, number>();

for (const tab of tabs) {
  const ws = wb.Sheets[tab.name];
  if (!ws) {
    console.warn(`Tab not found: ${tab.name}`);
    continue;
  }
  const parsed = parsePivotTab(ws);
  console.log(`${tab.name}: ${parsed.length} player rows`);

  const inserts = parsed
    .map((p) => {
      const fp = toFranchisePosition(p.position);
      if (!fp) {
        skippedPositions.set(p.position, (skippedPositions.get(p.position) ?? 0) + 1);
        return null;
      }
      return {
        playerName: p.player,
        pffPlayerId: p.pffPlayerId,
        rawPosition: p.position,
        franchisePosition: fp,
        side: tab.side,
        threeGoodYears: p.threeGoodYears,
        seasonsCount: p.seasonsCount,
      };
    })
    .filter((v): v is NonNullable<typeof v> => v !== null);

  for (let i = 0; i < inserts.length; i += 500) {
    const chunk = inserts.slice(i, i + 500);
    await db.insert(pffCareerSummary).values(chunk).onConflictDoNothing();
  }
  total += inserts.length;
}

console.log(`\nTotal rows inserted: ${total}`);
if (skippedPositions.size > 0) {
  console.log('Skipped positions (no franchise mapping):');
  for (const [pos, count] of [...skippedPositions.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${pos}: ${count}`);
  }
}

await client.end();
