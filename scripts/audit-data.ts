/**
 * Data completeness audit. Surfaces every gap we expect to see in our
 * model inputs so Tim/Jeff/Josh can decide what to fill before we re-tune
 * the algorithm. Run after every ingestion.
 *
 * Run: bun run scripts/audit-data.ts
 */

import {drizzle} from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import {officialDraftResults, playerPerformanceRatings, expertRankings, experts} from '../src/db/schema.js';
import {and, eq, gte, lte, sql} from 'drizzle-orm';

const DIRECT_URL = process.env.DIRECT_URL;
if (!DIRECT_URL) {
  console.error('DIRECT_URL is required');
  process.exit(1);
}
const client = postgres(DIRECT_URL, {prepare: false});
const db = drizzle(client);

function pct(n: number, d: number): string {
  if (d === 0) {
    return '0%';
  }
  return `${((n / d) * 100).toFixed(1)}%`;
}

function section(title: string) {
  console.log(`\n══════════════════════════════════════════════════════════════════`);
  console.log(title);
  console.log(`══════════════════════════════════════════════════════════════════`);
}

async function run() {
  const evalYear = new Date().getFullYear();
  console.log(`LLL DATA AUDIT · evaluation year ${evalYear}`);

  // ── PICKS ─────────────────────────────────────────────────────────────────
  section('1. DRAFT PICKS');
  const [pickTotal] = await db.select({c: sql<number>`COUNT(*)::int`}).from(officialDraftResults);
  const [pickByYear] = [
    await db
      .select({year: officialDraftResults.year, c: sql<number>`COUNT(*)::int`})
      .from(officialDraftResults)
      .groupBy(officialDraftResults.year)
      .orderBy(officialDraftResults.year),
  ];
  console.log(`Total picks: ${pickTotal.c}`);
  console.log(`By year:`);
  for (const r of pickByYear) {
    console.log(`   ${r.year}: ${r.c}`);
  }

  // ── POSITIONS ─────────────────────────────────────────────────────────────
  section('2. POSITIONS');
  const [posMissing] = await db
    .select({c: sql<number>`COUNT(*)::int`})
    .from(officialDraftResults)
    .where(sql`position IS NULL`);
  const posMissingByYear = await db
    .select({year: officialDraftResults.year, c: sql<number>`COUNT(*)::int`})
    .from(officialDraftResults)
    .where(sql`position IS NULL`)
    .groupBy(officialDraftResults.year)
    .orderBy(officialDraftResults.year);
  console.log(`Missing position: ${posMissing.c} / ${pickTotal.c} (${pct(posMissing.c, pickTotal.c)})`);
  for (const r of posMissingByYear) {
    console.log(`   ${r.year}: ${r.c}`);
  }

  const samplesNoPos = await db
    .select({
      name: officialDraftResults.playerName,
      year: officialDraftResults.year,
      team: officialDraftResults.teamName,
    })
    .from(officialDraftResults)
    .where(sql`position IS NULL AND year < ${2026}`)
    .limit(8);
  if (samplesNoPos.length > 0) {
    console.log(`Pre-2026 picks missing position (sample):`);
    for (const r of samplesNoPos) {
      console.log(`   ${r.year} ${r.team} · ${r.name}`);
    }
  }

  // ── CAREER RATINGS ────────────────────────────────────────────────────────
  section('3. CAREER RATINGS (cumulative w_av baseline)');
  const [careerTotal] = await db
    .select({c: sql<number>`COUNT(*)::int`})
    .from(playerPerformanceRatings)
    .where(eq(playerPerformanceRatings.isCareerRating, true));
  console.log(`Career rating rows: ${careerTotal.c}`);

  const careerByYear = await db
    .select({year: playerPerformanceRatings.draftYear, c: sql<number>`COUNT(*)::int`})
    .from(playerPerformanceRatings)
    .where(eq(playerPerformanceRatings.isCareerRating, true))
    .groupBy(playerPerformanceRatings.draftYear)
    .orderBy(playerPerformanceRatings.draftYear);
  console.log(`Career ratings by draft year:`);
  for (const r of careerByYear) {
    console.log(`   ${r.year}: ${r.c}`);
  }

  const [picksWithoutCareer] = await db
    .select({c: sql<number>`COUNT(*)::int`})
    .from(officialDraftResults)
    .where(
      sql`NOT EXISTS (
        SELECT 1 FROM player_performance_ratings r
        WHERE r.player_name = official_draft_results.player_name
        AND r.is_career_rating = true
      )`,
    );
  console.log(`Picks with no career rating row: ${picksWithoutCareer.c}`);

  // ── SEASON RATINGS ────────────────────────────────────────────────────────
  section('4. PER-SEASON RATINGS');
  const [seasonTotal] = await db
    .select({c: sql<number>`COUNT(*)::int`})
    .from(playerPerformanceRatings)
    .where(eq(playerPerformanceRatings.isCareerRating, false));
  console.log(`Per-season rating rows: ${seasonTotal.c}`);
  const seasonByYear = await db
    .select({year: playerPerformanceRatings.evaluationYear, c: sql<number>`COUNT(*)::int`})
    .from(playerPerformanceRatings)
    .where(eq(playerPerformanceRatings.isCareerRating, false))
    .groupBy(playerPerformanceRatings.evaluationYear)
    .orderBy(playerPerformanceRatings.evaluationYear);
  console.log(`Per-season rows by NFL season:`);
  for (const r of seasonByYear) {
    console.log(`   ${r.year}: ${r.c}`);
  }

  // Picks ≥ 2 NFL years old that have NO per-season rating at all (likely cut/never played).
  const orphans = await db
    .select({
      playerName: officialDraftResults.playerName,
      year: officialDraftResults.year,
      round: officialDraftResults.round,
      pickNumber: officialDraftResults.pickNumber,
      position: officialDraftResults.position,
      team: officialDraftResults.teamName,
    })
    .from(officialDraftResults)
    .where(
      sql`year < ${evalYear - 1}
        AND NOT EXISTS (
          SELECT 1 FROM player_performance_ratings r
          WHERE r.player_name = official_draft_results.player_name
          AND r.is_career_rating = false
        )`,
    );
  console.log(`Picks ≥ 2 yrs old with NO per-season ratings: ${orphans.length}`);
  if (orphans.length > 0) {
    console.log(`   (= drafted, never played a meaningful snap. Sample:)`);
    for (const r of orphans.slice(0, 10)) {
      console.log(`   ${r.year} R${r.round} #${r.pickNumber} ${r.position ?? '?'} · ${r.team} · ${r.playerName}`);
    }
  }

  // ── SNAP COVERAGE ─────────────────────────────────────────────────────────
  section('5. SNAP COVERAGE (rows with snap metadata)');
  const [snapTotal] = await db
    .select({c: sql<number>`COUNT(*)::int`})
    .from(playerPerformanceRatings)
    .where(and(eq(playerPerformanceRatings.isCareerRating, false), sql`metadata->'snap' IS NOT NULL`));
  console.log(`Per-season rows with snap data: ${snapTotal.c} / ${seasonTotal.c} (${pct(snapTotal.c, seasonTotal.c)})`);

  // Per-season rows missing snap metadata (these came from prod-score only)
  const noSnap = await db
    .select({
      year: playerPerformanceRatings.evaluationYear,
      c: sql<number>`COUNT(*)::int`,
    })
    .from(playerPerformanceRatings)
    .where(and(eq(playerPerformanceRatings.isCareerRating, false), sql`metadata->'snap' IS NULL`))
    .groupBy(playerPerformanceRatings.evaluationYear)
    .orderBy(playerPerformanceRatings.evaluationYear);
  console.log(`Season rows WITHOUT snap data, by year:`);
  for (const r of noSnap) {
    console.log(`   ${r.year}: ${r.c}`);
  }

  // ── CONTRACTS ────────────────────────────────────────────────────────────
  section('6. CONTRACT OUTCOMES');
  const contracts = await db
    .select({outcome: officialDraftResults.contractOutcome, c: sql<number>`COUNT(*)::int`})
    .from(officialDraftResults)
    .groupBy(officialDraftResults.contractOutcome)
    .orderBy(sql`COUNT(*) DESC`);
  for (const r of contracts) {
    console.log(`   ${r.outcome ?? '(none)'}: ${r.c}`);
  }

  // Picks who SHOULD have a 2nd-contract decision (drafted ≥ 4 years ago)
  // but have no contractOutcome.
  const cutoffYear = evalYear - 4;
  const [eligible] = await db
    .select({c: sql<number>`COUNT(*)::int`})
    .from(officialDraftResults)
    .where(lte(officialDraftResults.year, cutoffYear));
  const [eligibleWithOutcome] = await db
    .select({c: sql<number>`COUNT(*)::int`})
    .from(officialDraftResults)
    .where(and(lte(officialDraftResults.year, cutoffYear), sql`contract_outcome IS NOT NULL`));
  console.log(
    `\nPicks drafted ≤ ${cutoffYear} (eligible for 2nd contract): ${eligible.c} · with contractOutcome: ${eligibleWithOutcome.c} (${pct(eligibleWithOutcome.c, eligible.c)})`,
  );
  console.log(`That gap (${eligible.c - eligibleWithOutcome.c}) is what we still need from OverTheCap or similar.`);

  // ── EXPERTS ──────────────────────────────────────────────────────────────
  section('7. EXPERTS');
  const expertCounts = await db
    .select({
      expertId: experts.id,
      name: experts.name,
      org: experts.organization,
      ranks: sql<number>`COUNT(${expertRankings.id})::int`,
      yrs: sql<string>`STRING_AGG(DISTINCT ${expertRankings.year}::text, ',' ORDER BY ${expertRankings.year}::text)`,
    })
    .from(experts)
    .leftJoin(expertRankings, eq(expertRankings.expertId, experts.id))
    .groupBy(experts.id)
    .orderBy(sql`COUNT(${expertRankings.id}) DESC`);
  console.log(`${expertCounts.length} experts seeded.`);
  console.log(`With data:`);
  for (const r of expertCounts.filter((e) => e.ranks > 0)) {
    console.log(`   ${r.ranks.toString().padStart(4)} ranks · ${r.name} (${r.org}) [yrs: ${r.yrs}]`);
  }
  const empty = expertCounts.filter((e) => e.ranks === 0);
  console.log(`\nWITHOUT data (${empty.length}):`);
  for (const r of empty) {
    console.log(`   - ${r.name} (${r.org})`);
  }

  // ── SUMMARY ──────────────────────────────────────────────────────────────
  section('8. SUMMARY');
  const completeness = {
    picks: `${pickTotal.c} total`,
    positions: `${pickTotal.c - posMissing.c}/${pickTotal.c} (${pct(pickTotal.c - posMissing.c, pickTotal.c)})`,
    careerRatings: `${careerTotal.c}/${pickTotal.c} (${pct(careerTotal.c, pickTotal.c)})`,
    seasonRatings: `${seasonTotal.c} total rows`,
    snapData: `${snapTotal.c}/${seasonTotal.c} (${pct(snapTotal.c, seasonTotal.c)})`,
    contracts: `${eligibleWithOutcome.c}/${eligible.c} eligible picks classified (${pct(eligibleWithOutcome.c, eligible.c)})`,
    experts: `${expertCounts.filter((e) => e.ranks > 0).length}/${expertCounts.length} have data`,
  };
  for (const [k, v] of Object.entries(completeness)) {
    console.log(`  ${k.padEnd(16)} ${v}`);
  }
}

run()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => client.end());
