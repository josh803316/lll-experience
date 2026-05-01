/**
 * Re-ingest pff_player_stats from local CSVs (no Playwright). Fast way to
 * pick up the fixed extraction in ingest-pff.ts (defensive grade, per-row
 * onConflictDoUpdate) without re-downloading.
 *
 * Run: bun run --env-file=.env.local scripts/reingest-pff-from-disk.ts
 */
import {drizzle} from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import {pffPlayerStats} from '../src/db/schema.js';
import {sql} from 'drizzle-orm';
import {readdirSync, readFileSync} from 'fs';
import {join} from 'path';

const URL = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!URL) {
  throw new Error('DIRECT_URL or DATABASE_URL required');
}
const client = postgres(URL, {prepare: false});
const db = drizzle(client);

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let q = false;
  for (const c of line) {
    if (c === '"') {
      q = !q;
    } else if (c === ',' && !q) {
      out.push(cur);
      cur = '';
    } else {
      cur += c;
    }
  }
  out.push(cur);
  return out;
}

async function ingestCsv(path: string, category: string, season: number) {
  const text = readFileSync(path, 'utf8');
  const lines = text.split('\n').filter((l) => l.length > 0);
  if (lines.length < 2) {return 0;}
  const headers = splitCsvLine(lines[0]).map((h) => h.trim());

  type Row = typeof pffPlayerStats.$inferInsert;
  const rows: Row[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i]);
    if (cells.length < headers.length) {continue;}
    const stats: Record<string, string> = {};
    headers.forEach((h, idx) => (stats[h] = cells[idx] ?? ''));

    const playerName = stats.player || stats.name;
    if (!playerName) {continue;}

    const pffId = stats.player_id ? parseInt(stats.player_id, 10) : null;
    const position = stats.position || null;
    const teamAbbr = stats.team || stats.team_name || null;
    const gradeKey = category === 'defense' ? 'grades_defense' : 'grades_offense';
    const rawGrade = stats[gradeKey] || stats.grades_overall;
    const gradeValue = rawGrade ? parseFloat(rawGrade) : null;

    rows.push({playerName, pffId, season, position, teamAbbr, category, grade: gradeValue, stats});
  }

  // Dedupe — PFF emits separate rows when a player was traded mid-season, but
  // the unique index is (player_name, season, category). Postgres rejects an
  // ON CONFLICT batch that contains the same key twice, so collapse first.
  // Keep the row with the highest game count (the post-trade aggregate).
  const dedupedMap = new Map<string, Row>();
  for (const r of rows) {
    const k = `${r.playerName}::${r.season}::${r.category}`;
    const prior = dedupedMap.get(k);
    if (!prior) {
      dedupedMap.set(k, r);
      continue;
    }
    const priorGames = parseInt(((prior.stats as Record<string, string>) ?? {}).player_game_count || '0', 10);
    const curGames = parseInt(((r.stats as Record<string, string>) ?? {}).player_game_count || '0', 10);
    if (curGames > priorGames) {
      dedupedMap.set(k, r);
    }
  }
  const deduped = [...dedupedMap.values()];

  // Batch the upserts — single-row awaits run for hours on 50k rows.
  const CHUNK = 200;
  let count = 0;
  for (let i = 0; i < deduped.length; i += CHUNK) {
    const slice = deduped.slice(i, i + CHUNK);
    await db
      .insert(pffPlayerStats)
      .values(slice)
      .onConflictDoUpdate({
        target: [pffPlayerStats.playerName, pffPlayerStats.season, pffPlayerStats.category],
        set: {
          pffId: sql`excluded.pff_id`,
          position: sql`excluded.position`,
          teamAbbr: sql`excluded.team_abbr`,
          grade: sql`excluded.grade`,
          stats: sql`excluded.stats`,
          updatedAt: new Date(),
        },
      });
    count += slice.length;
  }
  return count;
}

async function run() {
  const dir = join(process.cwd(), 'pff_downloads');
  const files = readdirSync(dir).filter((f) => /^\d{4}_(passing|rushing|receiving|defense|blocking)\.csv$/.test(f));
  console.log(`Found ${files.length} CSVs.`);

  files.sort();
  for (const f of files) {
    const m = /^(\d{4})_(\w+)\.csv$/.exec(f);
    if (!m) {continue;}
    const season = parseInt(m[1], 10);
    const category = m[2];
    const n = await ingestCsv(join(dir, f), category, season);
    console.log(`  ${f}: ${n} rows`);
  }

  console.log('Re-ingest complete.');
}

run()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => client.end());
