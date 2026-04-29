/**
 * Per-season production ratings ingestion.
 *
 * Pulls weekly player stats from nflverse (offensive + defensive),
 * aggregates to per-season per-player totals, and computes a
 * position-specific production score that maps onto the same 0-10
 * LLL scale as the career rating. Writes one row per (player, season)
 * into player_performance_ratings with isCareerRating = false.
 *
 * Run: bun run scripts/ingest-season-ratings.ts
 */

import {drizzle} from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import {officialDraftResults, playerPerformanceRatings} from '../src/db/schema.js';
import {and, eq} from 'drizzle-orm';
import {LLLRatingEngine} from '../src/services/lll-rating-engine.js';

const DIRECT_URL = process.env.DIRECT_URL;
if (!DIRECT_URL) {
  console.error('DIRECT_URL is required');
  process.exit(1);
}

const OFFENSIVE_URL_PATTERN = (year: number) =>
  `https://github.com/nflverse/nflverse-data/releases/download/player_stats/player_stats_${year}.csv`;
const DEFENSIVE_URL = 'https://github.com/nflverse/nflverse-data/releases/download/player_stats/player_stats_def.csv';
const START_SEASON = 2015;
const END_SEASON = new Date().getFullYear();

const client = postgres(DIRECT_URL, {prepare: false});
const db = drizzle(client);

// ── Position-specific season-production formulas ────────────────────────────
//
//  Each formula returns a "production score" (~0-15 scale) representing how
//  much value the player created that season. Per-position formulas mirror
//  the relative weighting Pro Football Reference uses for AV.
//
//  We then map that score onto a 0-10 rating in `seasonScoreToRating()`.

type OffStats = {
  pass_yards: number;
  pass_tds: number;
  interceptions: number;
  sacks: number;
  rush_yards: number;
  rush_tds: number;
  carries: number;
  receptions: number;
  rec_yards: number;
  rec_tds: number;
  targets: number;
  games: number;
};

type DefStats = {
  tackles_solo: number;
  tackles_assist: number;
  tackles_for_loss: number;
  sacks: number;
  qb_hits: number;
  pass_defended: number;
  interceptions: number;
  fumbles_forced: number;
  fumbles_recovered: number;
  def_tds: number;
  games: number;
};

function offensiveProdScore(s: OffStats, position: string): number {
  const p = position.toUpperCase();
  if (p === 'QB') {
    return (s.pass_yards * 0.04 + s.pass_tds * 4 - s.interceptions * 2 + s.rush_yards * 0.1 + s.rush_tds * 4) / 30;
  }
  if (p === 'RB' || p === 'FB' || p === 'HB') {
    return (s.rush_yards * 0.1 + s.rush_tds * 5 + s.receptions * 0.5 + s.rec_yards * 0.08 + s.rec_tds * 5) / 22;
  }
  if (p === 'WR') {
    return (s.receptions * 0.7 + s.rec_yards * 0.085 + s.rec_tds * 5 + s.rush_yards * 0.05) / 18;
  }
  if (p === 'TE') {
    return (s.receptions * 0.8 + s.rec_yards * 0.09 + s.rec_tds * 5) / 15;
  }
  return 0;
}

function defensiveProdScore(s: DefStats, position: string): number {
  const p = position.toUpperCase();
  // Front-7 weighting (LB / DL / DE / Edge)
  if (['LB', 'OLB', 'ILB', 'MLB', 'DE', 'DL', 'DT', 'NT', 'EDGE'].includes(p)) {
    return (
      (s.sacks * 3.5 +
        s.tackles_for_loss * 1.2 +
        s.tackles_solo * 0.35 +
        s.tackles_assist * 0.18 +
        s.qb_hits * 0.6 +
        s.pass_defended * 0.8 +
        s.interceptions * 4 +
        s.fumbles_forced * 2.5 +
        s.def_tds * 6) /
      12
    );
  }
  // Secondary (CB / S / DB)
  if (['CB', 'S', 'DB', 'FS', 'SS'].includes(p)) {
    return (
      (s.interceptions * 5 +
        s.pass_defended * 1.5 +
        s.tackles_solo * 0.4 +
        s.tackles_assist * 0.18 +
        s.fumbles_forced * 2.5 +
        s.def_tds * 6) /
      7
    );
  }
  return 0;
}

function seasonScoreToRating(prodScore: number): number {
  // Cap raw production at 15, scale to 0-10.
  return Math.min(10, Math.max(0, Number((prodScore * (10 / 15)).toFixed(2))));
}

function applyCareerBonus(rating: number, yearsInNFL: number): number {
  // Cumulative experience bonus (subtle): +0.25 per year past Y2, max +1.0.
  const bonus = Math.min(1.0, Math.max(0, (yearsInNFL - 2) * 0.25));
  return Math.min(10, Number((rating + bonus).toFixed(2)));
}

// ── CSV parsing helpers ────────────────────────────────────────────────────

function splitCsvLine(line: string): string[] {
  // CSV with quoted fields. nflverse headshot_url has embedded commas inside
  // double-quoted strings; naive split corrupts every column after it.
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      // Toggle quote state. (We don't honor "" escaping — none of nflverse's
      // fields use it.)
      inQuotes = !inQuotes;
    } else if (c === ',' && !inQuotes) {
      out.push(cur);
      cur = '';
    } else {
      cur += c;
    }
  }
  out.push(cur);
  return out;
}

async function fetchCsv(url: string): Promise<{headers: string[]; rows: string[][]}> {
  console.log(`Fetching ${url}…`);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }
  const text = await response.text();
  const lines = text.split('\n');
  const headers = lines[0].split(',');
  const rows: string[][] = [];
  for (let i = 1; i < lines.length; i++) {
    const row = splitCsvLine(lines[i]);
    if (row.length < headers.length / 2) {
      continue;
    }
    rows.push(row);
  }
  console.log(`  ${rows.length} weekly rows`);
  return {headers, rows};
}

function num(v: string | undefined): number {
  if (!v) {
    return 0;
  }
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

// ── Aggregation ────────────────────────────────────────────────────────────

interface SeasonAgg<T> {
  playerName: string;
  position: string;
  season: number;
  stats: T;
}

function aggregateOffensive(headers: string[], rows: string[][]): SeasonAgg<OffStats>[] {
  const idx = (k: string) => headers.indexOf(k);
  const i = {
    season: idx('season'),
    seasonType: idx('season_type'),
    playerName: idx('player_display_name'),
    position: idx('position'),
    pass_yards: idx('passing_yards'),
    pass_tds: idx('passing_tds'),
    interceptions: idx('interceptions'),
    sacks: idx('sacks'),
    rush_yards: idx('rushing_yards'),
    rush_tds: idx('rushing_tds'),
    carries: idx('carries'),
    receptions: idx('receptions'),
    rec_yards: idx('receiving_yards'),
    rec_tds: idx('receiving_tds'),
    targets: idx('targets'),
  };
  const map = new Map<string, SeasonAgg<OffStats>>();
  for (const r of rows) {
    if (r[i.seasonType] !== 'REG') {
      continue;
    }
    const season = parseInt(r[i.season]);
    if (season < START_SEASON) {
      continue;
    }
    const playerName = (r[i.playerName] || '').replace(/"/g, '').trim();
    if (!playerName) {
      continue;
    }
    const position = (r[i.position] || '').toUpperCase();

    const key = `${LLLRatingEngine.normalizeName(playerName)}::${season}`;
    let agg = map.get(key);
    if (!agg) {
      agg = {
        playerName,
        position,
        season,
        stats: {
          pass_yards: 0,
          pass_tds: 0,
          interceptions: 0,
          sacks: 0,
          rush_yards: 0,
          rush_tds: 0,
          carries: 0,
          receptions: 0,
          rec_yards: 0,
          rec_tds: 0,
          targets: 0,
          games: 0,
        },
      };
      map.set(key, agg);
    }
    const s = agg.stats;
    s.pass_yards += num(r[i.pass_yards]);
    s.pass_tds += num(r[i.pass_tds]);
    s.interceptions += num(r[i.interceptions]);
    s.sacks += num(r[i.sacks]);
    s.rush_yards += num(r[i.rush_yards]);
    s.rush_tds += num(r[i.rush_tds]);
    s.carries += num(r[i.carries]);
    s.receptions += num(r[i.receptions]);
    s.rec_yards += num(r[i.rec_yards]);
    s.rec_tds += num(r[i.rec_tds]);
    s.targets += num(r[i.targets]);
    s.games += 1; // 1 row per game
  }
  return [...map.values()];
}

function aggregateDefensive(headers: string[], rows: string[][]): SeasonAgg<DefStats>[] {
  const idx = (k: string) => headers.indexOf(k);
  const i = {
    season: idx('season'),
    seasonType: idx('season_type'),
    playerName: idx('player_display_name'),
    position: idx('position'),
    tackles_solo: idx('def_tackles_solo'),
    tackles_assist: idx('def_tackle_assists'),
    tackles_for_loss: idx('def_tackles_for_loss'),
    sacks: idx('def_sacks'),
    qb_hits: idx('def_qb_hits'),
    pass_defended: idx('def_pass_defended'),
    interceptions: idx('def_interceptions'),
    fumbles_forced: idx('def_fumbles_forced'),
    fumbles_recovered: idx('def_fumble_recovery_own'),
    def_tds: idx('def_tds'),
  };
  const map = new Map<string, SeasonAgg<DefStats>>();
  for (const r of rows) {
    if (r[i.seasonType] !== 'REG') {
      continue;
    }
    const season = parseInt(r[i.season]);
    if (season < START_SEASON) {
      continue;
    }
    const playerName = (r[i.playerName] || '').replace(/"/g, '').trim();
    if (!playerName) {
      continue;
    }
    const position = (r[i.position] || '').toUpperCase();

    const key = `${LLLRatingEngine.normalizeName(playerName)}::${season}`;
    let agg = map.get(key);
    if (!agg) {
      agg = {
        playerName,
        position,
        season,
        stats: {
          tackles_solo: 0,
          tackles_assist: 0,
          tackles_for_loss: 0,
          sacks: 0,
          qb_hits: 0,
          pass_defended: 0,
          interceptions: 0,
          fumbles_forced: 0,
          fumbles_recovered: 0,
          def_tds: 0,
          games: 0,
        },
      };
      map.set(key, agg);
    }
    const s = agg.stats;
    s.tackles_solo += num(r[i.tackles_solo]);
    s.tackles_assist += num(r[i.tackles_assist]);
    s.tackles_for_loss += num(r[i.tackles_for_loss]);
    s.sacks += num(r[i.sacks]);
    s.qb_hits += num(r[i.qb_hits]);
    s.pass_defended += num(r[i.pass_defended]);
    s.interceptions += num(r[i.interceptions]);
    s.fumbles_forced += num(r[i.fumbles_forced]);
    s.fumbles_recovered += num(r[i.fumbles_recovered]);
    s.def_tds += num(r[i.def_tds]);
    s.games += 1;
  }
  return [...map.values()];
}

// ── Main ───────────────────────────────────────────────────────────────────

async function run() {
  console.log('--- Per-Season Ratings Ingestion ---');

  // 1. Load drafted-player index so we only score players we care about.
  const drafted = await db
    .select({playerName: officialDraftResults.playerName, draftYear: officialDraftResults.year})
    .from(officialDraftResults);
  const draftedByName = new Map<string, {playerName: string; draftYear: number}>();
  for (const d of drafted) {
    if (!d.playerName) {
      continue;
    }
    draftedByName.set(LLLRatingEngine.normalizeName(d.playerName), {playerName: d.playerName, draftYear: d.draftYear});
  }
  console.log(`Drafted players in scope: ${draftedByName.size}`);

  // 2. Pull and aggregate offensive (per-year) + defensive (single file) stats.
  const offAgg: SeasonAgg<OffStats>[] = [];
  for (let yr = START_SEASON; yr <= END_SEASON; yr++) {
    try {
      const off = await fetchCsv(OFFENSIVE_URL_PATTERN(yr));
      offAgg.push(...aggregateOffensive(off.headers, off.rows));
    } catch (err) {
      console.warn(`  Skipping ${yr}: ${(err as Error).message}`);
    }
  }
  const def = await fetchCsv(DEFENSIVE_URL);
  const defAgg = aggregateDefensive(def.headers, def.rows);
  console.log(`Aggregated: ${offAgg.length} offensive (player×season), ${defAgg.length} defensive`);

  // 3. Compute per-season ratings, filtered to drafted players only.
  type SeasonRow = {
    playerName: string;
    draftYear: number;
    evaluationYear: number;
    rating: number;
    baseRating: number;
    position: string;
    metadata: Record<string, unknown>;
  };
  const seasonRows: SeasonRow[] = [];

  const processOff = (agg: SeasonAgg<OffStats>) => {
    const norm = LLLRatingEngine.normalizeName(agg.playerName);
    const drafted = draftedByName.get(norm);
    if (!drafted) {
      return;
    }
    const prodScore = offensiveProdScore(agg.stats, agg.position);
    if (prodScore <= 0) {
      return;
    }
    const baseRating = seasonScoreToRating(prodScore);
    const yearsInNFL = Math.max(1, agg.season - drafted.draftYear + 1);
    const rating = applyCareerBonus(baseRating, yearsInNFL);
    seasonRows.push({
      playerName: drafted.playerName,
      draftYear: drafted.draftYear,
      evaluationYear: agg.season,
      rating,
      baseRating,
      position: agg.position,
      metadata: {prodScore: Number(prodScore.toFixed(2)), games: agg.stats.games, side: 'OFF', stats: agg.stats},
    });
  };
  const processDef = (agg: SeasonAgg<DefStats>) => {
    const norm = LLLRatingEngine.normalizeName(agg.playerName);
    const drafted = draftedByName.get(norm);
    if (!drafted) {
      return;
    }
    const prodScore = defensiveProdScore(agg.stats, agg.position);
    if (prodScore <= 0) {
      return;
    }
    const baseRating = seasonScoreToRating(prodScore);
    const yearsInNFL = Math.max(1, agg.season - drafted.draftYear + 1);
    const rating = applyCareerBonus(baseRating, yearsInNFL);
    seasonRows.push({
      playerName: drafted.playerName,
      draftYear: drafted.draftYear,
      evaluationYear: agg.season,
      rating,
      baseRating,
      position: agg.position,
      metadata: {prodScore: Number(prodScore.toFixed(2)), games: agg.stats.games, side: 'DEF', stats: agg.stats},
    });
  };

  for (const a of offAgg) {
    processOff(a);
  }
  for (const a of defAgg) {
    processDef(a);
  }
  console.log(`Computed ${seasonRows.length} season ratings`);

  // 4. Wipe existing per-season rows and insert fresh.
  const sql = client;
  console.log('Wiping existing per-season rows…');
  const del = await db.delete(playerPerformanceRatings).where(eq(playerPerformanceRatings.isCareerRating, false));
  console.log(`  deleted ${del.count}`);

  console.log('Inserting new per-season rows…');
  const CHUNK = 500;
  for (let i = 0; i < seasonRows.length; i += CHUNK) {
    const slice = seasonRows.slice(i, i + CHUNK);
    await db.insert(playerPerformanceRatings).values(
      slice.map((r) => ({
        playerName: r.playerName,
        draftYear: r.draftYear,
        evaluationYear: r.evaluationYear,
        rating: r.rating,
        isCareerRating: false,
        justification: `Season ${r.evaluationYear} production (${r.position}) → base ${r.baseRating}, career bonus applied`,
        metadata: r.metadata,
      })),
    );
    process.stdout.write(`. `);
  }
  console.log(`\nInserted ${seasonRows.length} rows.`);

  // 5. Sanity check.
  const sample = await db
    .select()
    .from(playerPerformanceRatings)
    .where(
      and(
        eq(playerPerformanceRatings.isCareerRating, false),
        eq(playerPerformanceRatings.playerName, 'Patrick Mahomes'),
      ),
    );
  console.log('Mahomes per-season:');
  for (const r of sample.sort((a, b) => a.evaluationYear - b.evaluationYear)) {
    console.log(`  ${r.evaluationYear}: ${r.rating}`);
  }

  console.log('Ingestion complete.');
}

run()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => client.end());
