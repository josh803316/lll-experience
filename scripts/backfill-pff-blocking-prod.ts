/**
 * Backfill OL production rows in player_performance_ratings from PFF blocking
 * CSVs. Mirrors backfill-pff-defense-prod.ts but for offensive linemen
 * (T/G/C). nflverse has no production stats for OL, so without this every OL
 * profile (Trent Brown, etc.) showed blank G/KEY STATS/PROD columns.
 *
 * Strategy: read pff_downloads/{season}_blocking.csv for any season we have on
 * disk, filter to T/G/C, and merge a stats blob + prodScore (PFF grades_offense
 * on a 0-100 scale) into the existing per-season row. Leaves the rating
 * untouched — snap-counts already establishes a sensible OL rating from snap
 * share, and we don't have a better signal here.
 *
 * Idempotent. Run order: ingest-season-ratings → ingest-snap-counts →
 * backfill-pff-defense-prod → backfill-pff-blocking-prod.
 *
 * Run: bun run --env-file=.env.local scripts/backfill-pff-blocking-prod.ts
 */
import {drizzle} from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import {officialDraftResults, playerPerformanceRatings} from '../src/db/schema.js';
import {and, eq} from 'drizzle-orm';
import {readFileSync, existsSync, readdirSync} from 'fs';
import {join} from 'path';
import {LLLRatingEngine} from '../src/services/lll-rating-engine.js';

const URL = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!URL) {
  throw new Error('DIRECT_URL or DATABASE_URL required');
}
const client = postgres(URL, {prepare: false});
const db = drizzle(client);

const OL_POSITIONS = new Set(['T', 'G', 'C', 'OT', 'OG', 'OL']);

interface OLStats {
  games: number;
  grades_offense: number;
  grades_pass_block: number;
  grades_run_block: number;
  pressures_allowed: number;
  sacks_allowed: number;
  hits_allowed: number;
  hurries_allowed: number;
  penalties: number;
  snap_counts_offense: number;
}

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

function loadCsv(path: string): {rows: Record<string, string>[]} {
  const txt = readFileSync(path, 'utf8');
  const lines = txt.split('\n').filter((l) => l.length > 0);
  const headers = splitCsvLine(lines[0]).map((h) => h.trim());
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i]);
    const r: Record<string, string> = {};
    headers.forEach((h, idx) => (r[h] = cells[idx] ?? ''));
    rows.push(r);
  }
  return {rows};
}

function num(v: string | undefined): number {
  if (!v) {
    return 0;
  }
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

async function run() {
  console.log('--- PFF OL backfill ---');

  const drafted = await db
    .select({playerName: officialDraftResults.playerName, draftYear: officialDraftResults.year})
    .from(officialDraftResults);
  const draftedByName = new Map<string, {playerName: string; draftYear: number}>();
  for (const d of drafted) {
    if (!d.playerName) {
      continue;
    }
    const k = LLLRatingEngine.normalizeName(d.playerName);
    if (!draftedByName.has(k)) {
      draftedByName.set(k, {playerName: d.playerName, draftYear: d.draftYear});
    }
  }
  console.log(`Drafted players in scope: ${draftedByName.size}`);

  const downloads = join(process.cwd(), 'pff_downloads');
  const seasons = readdirSync(downloads)
    .filter((f) => /^\d{4}_blocking\.csv$/.test(f))
    .map((f) => parseInt(f.slice(0, 4), 10))
    .sort();
  console.log(`Blocking CSVs available: ${seasons.join(', ')}`);

  type Row = {
    playerName: string;
    draftYear: number;
    season: number;
    position: string;
    stats: OLStats;
    prodScore: number;
  };
  const toUpsert: Row[] = [];

  for (const season of seasons) {
    const path = join(downloads, `${season}_blocking.csv`);
    if (!existsSync(path)) {
      continue;
    }
    const {rows} = loadCsv(path);
    let matched = 0;
    let skippedUndrafted = 0;
    let skippedNonOL = 0;

    for (const r of rows) {
      const playerName = r.player;
      if (!playerName) {
        continue;
      }
      const position = (r.position || '').toUpperCase();
      if (!OL_POSITIONS.has(position)) {
        skippedNonOL++;
        continue;
      }
      const draftedRec = draftedByName.get(LLLRatingEngine.normalizeName(playerName));
      if (!draftedRec) {
        skippedUndrafted++;
        continue;
      }
      const stats: OLStats = {
        games: num(r.player_game_count),
        grades_offense: num(r.grades_offense),
        grades_pass_block: num(r.grades_pass_block),
        grades_run_block: num(r.grades_run_block),
        pressures_allowed: num(r.pressures_allowed),
        sacks_allowed: num(r.sacks_allowed),
        hits_allowed: num(r.hits_allowed),
        hurries_allowed: num(r.hurries_allowed),
        penalties: num(r.penalties),
        snap_counts_offense: num(r.snap_counts_offense),
      };
      // prodScore is the PFF overall offense grade (0-100). Surfaced in the
      // PROD column of the analyzer's season table for OL.
      const prodScore = stats.grades_offense;
      toUpsert.push({
        playerName: draftedRec.playerName,
        draftYear: draftedRec.draftYear,
        season,
        position,
        stats,
        prodScore: Number(prodScore.toFixed(1)),
      });
      matched++;
    }
    console.log(
      `  ${season}: ${rows.length} CSV rows · ${matched} OL matched · ${skippedUndrafted} undrafted · ${skippedNonOL} non-OL`,
    );
  }

  console.log(`Total OL rows to merge: ${toUpsert.length}`);

  // Pull existing per-season rows we'll touch.
  const existing = await db
    .select({
      id: playerPerformanceRatings.id,
      playerName: playerPerformanceRatings.playerName,
      evaluationYear: playerPerformanceRatings.evaluationYear,
      metadata: playerPerformanceRatings.metadata,
      rating: playerPerformanceRatings.rating,
    })
    .from(playerPerformanceRatings)
    .where(eq(playerPerformanceRatings.isCareerRating, false));
  const existingByKey = new Map<string, (typeof existing)[number]>();
  for (const e of existing) {
    existingByKey.set(`${e.playerName}::${e.evaluationYear}`, e);
  }

  let updated = 0;
  let inserted = 0;
  let skippedExisting = 0;
  const CHUNK = 200;
  for (let i = 0; i < toUpsert.length; i += CHUNK) {
    const slice = toUpsert.slice(i, i + CHUNK);
    await Promise.all(
      slice.map(async (r) => {
        const k = `${r.playerName}::${r.season}`;
        const ex = existingByKey.get(k);
        const existingMeta = (ex?.metadata as Record<string, unknown> | null) ?? {};

        // Don't clobber another source's stats. If something else (nflverse,
        // an earlier custom backfill) already populated `stats` for this row
        // and it isn't tagged as 'pff', leave it alone.
        const hasOtherStats =
          existingMeta.stats &&
          typeof existingMeta.stats === 'object' &&
          existingMeta.source !== 'pff' &&
          existingMeta.source !== undefined;
        if (hasOtherStats) {
          skippedExisting++;
          return;
        }

        const newMeta: Record<string, unknown> = {
          ...existingMeta,
          side: 'OL',
          games: r.stats.games,
          stats: r.stats,
          prodScore: r.prodScore,
          source: 'pff',
        };
        const justification = `Season ${r.season} OL stats (${r.position}, PFF blocking) — pass-block ${r.stats.grades_pass_block.toFixed(1)} / run-block ${r.stats.grades_run_block.toFixed(1)} / ${r.stats.sacks_allowed} sk allowed`;

        if (ex) {
          await db
            .update(playerPerformanceRatings)
            .set({metadata: newMeta, justification})
            .where(eq(playerPerformanceRatings.id, ex.id));
          updated++;
        } else {
          // Fall back to inserting a row using the PFF grade as a simple
          // 0-10 rating. This is rare — most OL already have a snap-driven
          // row from ingest-snap-counts.ts.
          const fallbackRating = Number(Math.min(10, r.stats.grades_offense / 10).toFixed(2));
          await db.insert(playerPerformanceRatings).values({
            playerName: r.playerName,
            draftYear: r.draftYear,
            evaluationYear: r.season,
            rating: fallbackRating,
            isCareerRating: false,
            justification,
            metadata: newMeta,
          });
          inserted++;
        }
      }),
    );
    process.stdout.write('.');
  }
  console.log(`\nUpdated ${updated}, inserted ${inserted}, skipped ${skippedExisting} (have non-PFF stats already).`);

  const checks = ['Trent Brown', 'Penei Sewell', 'Tristan Wirfs', 'Quenton Nelson'];
  for (const name of checks) {
    const rows = await db
      .select()
      .from(playerPerformanceRatings)
      .where(and(eq(playerPerformanceRatings.playerName, name), eq(playerPerformanceRatings.isCareerRating, false)))
      .orderBy(playerPerformanceRatings.evaluationYear);
    console.log(`\n${name}: ${rows.length} per-season rows`);
    for (const r of rows.slice(-4)) {
      const m = (r.metadata as Record<string, unknown>) ?? {};
      const stats = m.stats as Record<string, number> | undefined;
      const games = stats?.games ?? '—';
      const pb = stats?.grades_pass_block ?? '—';
      const rb = stats?.grades_run_block ?? '—';
      console.log(
        `  ${r.evaluationYear}: rating=${r.rating}  games=${games}  pb=${pb}  rb=${rb}  src=${(m.source as string) ?? 'nflverse'}`,
      );
    }
  }

  console.log('\nDone.');
}

run()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => client.end());
