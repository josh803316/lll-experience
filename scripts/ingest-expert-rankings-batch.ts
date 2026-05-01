/**
 * Bulk-load historical expert big boards / mock drafts into expert_rankings.
 *
 * Reads from expert-rankings-data*.ts (parts 1/2/3). For each (expert, year)
 * board: deletes any existing rows for that pair and re-inserts the full
 * ranking. Idempotent — safe to re-run.
 *
 * Skips boards whose expert slug isn't in the experts table (logs warning).
 *
 * Run: bun run --env-file=.env.local scripts/ingest-expert-rankings-batch.ts
 */
import {drizzle} from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import {expertRankings, experts} from '../src/db/schema.js';
import {eq, and} from 'drizzle-orm';
import {BOARDS_PART1} from './expert-rankings-data.js';
import {BOARDS_PART2} from './expert-rankings-data-part2.js';
import {BOARDS_PART3} from './expert-rankings-data-part3.js';

const URL = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!URL) {
  throw new Error('DIRECT_URL or DATABASE_URL required');
}
const client = postgres(URL, {prepare: false});
const db = drizzle(client);

async function run() {
  const allBoards = [...BOARDS_PART1, ...BOARDS_PART2, ...BOARDS_PART3];
  console.log(`--- Expert rankings ingest: ${allBoards.length} boards ---`);

  // Build a slug -> expertId lookup.
  const allExperts = await db.select({id: experts.id, slug: experts.slug}).from(experts);
  const idBySlug = new Map(allExperts.map((e) => [e.slug, e.id]));

  let totalInserted = 0;
  let totalDeleted = 0;
  let boardsLoaded = 0;
  const skipped: string[] = [];

  for (const board of allBoards) {
    const expertId = idBySlug.get(board.expertSlug);
    if (!expertId) {
      skipped.push(`${board.expertSlug} ${board.year} (slug not in experts table)`);
      continue;
    }

    // Replace existing rows for this (expert, year).
    const deleteResult = await db
      .delete(expertRankings)
      .where(and(eq(expertRankings.expertId, expertId), eq(expertRankings.year, board.year)))
      .returning({id: expertRankings.id});
    totalDeleted += deleteResult.length;

    // Insert new rows.
    const commentary =
      `${board.note ? board.note + ' · ' : ''}confidence: ${board.confidence} · source: ${board.source}`.slice(0, 1000);

    const values = board.rankings.map((r) => ({
      expertId,
      year: board.year,
      playerName: r.player,
      rank: r.rank,
      grade: null,
      commentary,
    }));

    if (values.length > 0) {
      // Postgres has a parameter limit; chunk to be safe (200 rows × 6 cols = 1200 params).
      const CHUNK = 200;
      for (let i = 0; i < values.length; i += CHUNK) {
        await db.insert(expertRankings).values(values.slice(i, i + CHUNK));
      }
    }

    totalInserted += values.length;
    boardsLoaded++;
    console.log(
      `  ${board.expertSlug.padEnd(18)} ${board.year}  →  ${String(values.length).padStart(3)} rows  (replaced ${deleteResult.length})  [${board.confidence}]`,
    );
  }

  console.log('\n=== Summary ===');
  console.log(`Boards loaded:    ${boardsLoaded}`);
  console.log(`Rows inserted:    ${totalInserted}`);
  console.log(`Rows replaced:    ${totalDeleted}`);
  if (skipped.length > 0) {
    console.log(`Skipped (${skipped.length}):`);
    for (const s of skipped) {
      console.log(`  - ${s}`);
    }
  }

  // Final coverage report.
  const coverage = await db
    .select({
      slug: experts.slug,
      name: experts.name,
      year: expertRankings.year,
    })
    .from(expertRankings)
    .innerJoin(experts, eq(expertRankings.expertId, experts.id));

  const byExpert = new Map<string, {name: string; years: Set<number>; total: number}>();
  for (const c of coverage) {
    if (!byExpert.has(c.slug)) {
      byExpert.set(c.slug, {name: c.name, years: new Set(), total: 0});
    }
    const e = byExpert.get(c.slug);
    if (!e) {
      continue;
    }
    e.years.add(c.year);
    e.total++;
  }

  console.log('\n=== Coverage after ingest ===');
  const sorted = [...byExpert.entries()].sort((a, b) => a[1].name.localeCompare(b[1].name));
  for (const [slug, info] of sorted) {
    const yrs = [...info.years].sort().join(', ');
    console.log(`  ${slug.padEnd(18)} ${info.name.padEnd(28)} ${info.total} rows · ${yrs}`);
  }
}

run()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => client.end());
