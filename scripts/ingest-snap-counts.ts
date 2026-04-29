/**
 * Snap-count ingestion. Pulls per-year nflverse snap_counts files,
 * aggregates per (player, season), and updates per-season ratings so
 * OL / blocking TEs / coverage DBs (whose value can't be read from box
 * scores) still get fair credit when they're starters.
 *
 * Final season rating = max(prodScore_rating, snapShare_rating) + experience bonus
 *
 * Run: bun run scripts/ingest-snap-counts.ts
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

const SNAP_URL_PATTERN = (year: number) =>
  `https://github.com/nflverse/nflverse-data/releases/download/snap_counts/snap_counts_${year}.csv`;
const START_SEASON = 2015;
const END_SEASON = new Date().getFullYear();

const client = postgres(DIRECT_URL, {prepare: false});
const db = drizzle(client);

// ── Snap-share → 0-10 rating ──────────────────────────────────────────────
//
//   90%+ snap = 7.0  (every-down starter, plays through nicks)
//   70-90%   = 6.0  (clear starter)
//   50-70%   = 4.5  (rotational starter / package player)
//   30-50%   = 3.0  (heavy backup / role player)
//   15-30%   = 1.5  (situational / depth)
//   <15%     = 0.5  (deep depth / inactive most weeks)
//
// Snap rate ≥ 6 represents "the team trusts you to be on the field," which
// matches what a 2nd-contract worth giving requires.
function snapShareToRating(snapPct: number): number {
  if (snapPct >= 0.9) {
    return 7.0;
  }
  if (snapPct >= 0.7) {
    return 6.0;
  }
  if (snapPct >= 0.5) {
    return 4.5;
  }
  if (snapPct >= 0.3) {
    return 3.0;
  }
  if (snapPct >= 0.15) {
    return 1.5;
  }
  if (snapPct > 0) {
    return 0.5;
  }
  return 0;
}

function applyCareerBonus(rating: number, yearsInNFL: number): number {
  const bonus = Math.min(1.0, Math.max(0, (yearsInNFL - 2) * 0.25));
  return Math.min(10, Number((rating + bonus).toFixed(2)));
}

function splitCsv(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
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

async function fetchCsv(url: string): Promise<{headers: string[]; rows: string[][]}> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }
  const text = await response.text();
  const lines = text.split('\n');
  const headers = lines[0].split(',');
  const rows: string[][] = [];
  for (let i = 1; i < lines.length; i++) {
    const r = splitCsv(lines[i]);
    if (r.length < headers.length / 2) {
      continue;
    }
    rows.push(r);
  }
  return {headers, rows};
}

interface SnapAgg {
  playerName: string;
  position: string;
  season: number;
  games: number;
  offSnaps: number;
  defSnaps: number;
  stSnaps: number;
  offPctSum: number;
  defPctSum: number;
  stPctSum: number;
  offGames: number;
  defGames: number;
  stGames: number;
}

function num(v: string | undefined): number {
  if (!v) {
    return 0;
  }
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

async function aggregateYear(year: number): Promise<SnapAgg[]> {
  let csv;
  try {
    csv = await fetchCsv(SNAP_URL_PATTERN(year));
  } catch (e) {
    console.warn(`  ${year}: skipped (${(e as Error).message})`);
    return [];
  }
  const idx = (k: string) => csv.headers.indexOf(k);
  const i = {
    season: idx('season'),
    seasonType: idx('game_type'),
    name: idx('player'),
    position: idx('position'),
    offSnaps: idx('offense_snaps'),
    offPct: idx('offense_pct'),
    defSnaps: idx('defense_snaps'),
    defPct: idx('defense_pct'),
    stSnaps: idx('st_snaps'),
    stPct: idx('st_pct'),
  };
  const map = new Map<string, SnapAgg>();
  for (const r of csv.rows) {
    if (r[i.seasonType] !== 'REG') {
      continue;
    }
    const season = parseInt(r[i.season]);
    if (season !== year) {
      continue;
    }
    const playerName = (r[i.name] || '').replace(/"/g, '').trim();
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
        games: 0,
        offSnaps: 0,
        defSnaps: 0,
        stSnaps: 0,
        offPctSum: 0,
        defPctSum: 0,
        stPctSum: 0,
        offGames: 0,
        defGames: 0,
        stGames: 0,
      };
      map.set(key, agg);
    }
    agg.games++;
    const offS = num(r[i.offSnaps]);
    const defS = num(r[i.defSnaps]);
    const stS = num(r[i.stSnaps]);
    agg.offSnaps += offS;
    agg.defSnaps += defS;
    agg.stSnaps += stS;
    if (offS > 0) {
      agg.offPctSum += num(r[i.offPct]);
      agg.offGames++;
    }
    if (defS > 0) {
      agg.defPctSum += num(r[i.defPct]);
      agg.defGames++;
    }
    if (stS > 0) {
      agg.stPctSum += num(r[i.stPct]);
      agg.stGames++;
    }
  }
  console.log(`  ${year}: ${map.size} player-seasons`);
  return [...map.values()];
}

async function run() {
  console.log('--- Snap-count ingestion ---');

  // 1. Index drafted players (we only score people we care about).
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

  // 2. Pull each season's snap counts.
  const allAgg: SnapAgg[] = [];
  for (let y = START_SEASON; y <= END_SEASON; y++) {
    const ag = await aggregateYear(y);
    allAgg.push(...ag);
  }
  console.log(`Total player-season snap aggregates: ${allAgg.length}`);

  // 3. Pull existing per-season production rows so we can merge.
  const existing = await db
    .select({
      id: playerPerformanceRatings.id,
      playerName: playerPerformanceRatings.playerName,
      draftYear: playerPerformanceRatings.draftYear,
      evaluationYear: playerPerformanceRatings.evaluationYear,
      rating: playerPerformanceRatings.rating,
      metadata: playerPerformanceRatings.metadata,
    })
    .from(playerPerformanceRatings)
    .where(eq(playerPerformanceRatings.isCareerRating, false));
  const existingByKey = new Map<string, (typeof existing)[number]>();
  for (const r of existing) {
    const k = `${LLLRatingEngine.normalizeName(r.playerName)}::${r.evaluationYear}`;
    existingByKey.set(k, r);
  }
  console.log(`Existing per-season rows: ${existing.length}`);

  // 4. For each snap aggregate that maps to a drafted player:
  //    - compute snap-share rating
  //    - merge with existing prodScore-based rating (take MAX of bases)
  //    - apply experience bonus
  //    - update existing row OR insert new
  let updated = 0;
  let inserted = 0;
  const updateBatches: Array<{id: number; rating: number; metadata: Record<string, unknown>; justification: string}> =
    [];
  const insertBatches: Array<typeof playerPerformanceRatings.$inferInsert> = [];

  for (const agg of allAgg) {
    const key = LLLRatingEngine.normalizeName(agg.playerName);
    const drafted = draftedByName.get(key);
    if (!drafted) {
      continue;
    }
    const yearsInNFL = Math.max(1, agg.season - drafted.draftYear + 1);

    // Snap share — pick the dominant side. If a player splits, take the higher.
    const offPct = agg.offGames > 0 ? agg.offPctSum / agg.offGames : 0;
    const defPct = agg.defGames > 0 ? agg.defPctSum / agg.defGames : 0;
    const stPct = agg.stGames > 0 ? agg.stPctSum / agg.stGames : 0;
    const dominantSide = offPct >= defPct ? (offPct >= stPct ? 'OFF' : 'ST') : defPct >= stPct ? 'DEF' : 'ST';
    const dominantPct = Math.max(offPct, defPct, stPct);
    const snapBase = snapShareToRating(dominantPct);

    const existingKey = `${key}::${agg.season}`;
    const existingRow = existingByKey.get(existingKey);

    let prodBase = 0;
    if (existingRow) {
      // Decode the prodScore-base rating from the existing row metadata.
      const meta = (existingRow.metadata as {prodScore?: number} | null) ?? {};
      const prodScore = typeof meta.prodScore === 'number' ? meta.prodScore : 0;
      // Mirror the seasonScoreToRating from the production ingest: cap 15, scale to 10.
      prodBase = Math.min(10, Math.max(0, Number((prodScore * (10 / 15)).toFixed(2))));
    }

    const baseRating = Math.max(prodBase, snapBase);
    const newRating = applyCareerBonus(baseRating, yearsInNFL);
    const newMeta = {
      ...((existingRow?.metadata as Record<string, unknown> | null) ?? {}),
      snap: {
        offPct: Number(offPct.toFixed(3)),
        defPct: Number(defPct.toFixed(3)),
        stPct: Number(stPct.toFixed(3)),
        offSnaps: agg.offSnaps,
        defSnaps: agg.defSnaps,
        stSnaps: agg.stSnaps,
        games: agg.games,
        dominantSide,
        snapBase,
        prodBase,
      },
    };

    const justification = `Season ${agg.season} (${agg.position}) — max(prod ${prodBase.toFixed(2)}, snap@${(dominantPct * 100).toFixed(0)}% → ${snapBase.toFixed(2)}) + career bonus`;

    if (existingRow) {
      updateBatches.push({id: existingRow.id, rating: newRating, metadata: newMeta, justification});
    } else {
      // No prodScore row existed (typical OL) — insert new.
      insertBatches.push({
        playerName: drafted.playerName,
        draftYear: drafted.draftYear,
        evaluationYear: agg.season,
        rating: newRating,
        isCareerRating: false,
        justification,
        metadata: newMeta,
      });
    }
  }

  console.log(`Updates: ${updateBatches.length}, Inserts: ${insertBatches.length}`);

  // 5. Apply updates and inserts in chunks.
  const CHUNK = 200;
  for (let i = 0; i < updateBatches.length; i += CHUNK) {
    const slice = updateBatches.slice(i, i + CHUNK);
    await Promise.all(
      slice.map((u) =>
        db
          .update(playerPerformanceRatings)
          .set({rating: u.rating, metadata: u.metadata, justification: u.justification})
          .where(eq(playerPerformanceRatings.id, u.id)),
      ),
    );
    updated += slice.length;
    process.stdout.write('.');
  }
  console.log(`\nUpdated ${updated} existing rows.`);

  for (let i = 0; i < insertBatches.length; i += CHUNK) {
    const slice = insertBatches.slice(i, i + CHUNK);
    await db.insert(playerPerformanceRatings).values(slice);
    inserted += slice.length;
    process.stdout.write('.');
  }
  console.log(`\nInserted ${inserted} new rows.`);

  // 6. Sanity check: pull a few players that should have moved.
  const checks = ['Colton McKivitz', 'Aaron Banks', 'Spencer Burford', 'Charlie Woerner', 'Nick Bosa'];
  for (const name of checks) {
    const rows = await db
      .select()
      .from(playerPerformanceRatings)
      .where(and(eq(playerPerformanceRatings.playerName, name), eq(playerPerformanceRatings.isCareerRating, false)))
      .orderBy(playerPerformanceRatings.evaluationYear);
    console.log(`\n${name}:`);
    for (const r of rows) {
      const m = r.metadata as {snap?: {offPct: number; defPct: number; snapBase: number; prodBase: number}};
      const snap = m.snap;
      console.log(
        `  ${r.evaluationYear}: rating ${r.rating.toFixed(2)}` +
          (snap
            ? ` · off ${(snap.offPct * 100).toFixed(0)}% def ${(snap.defPct * 100).toFixed(0)}% (snapBase ${snap.snapBase}, prodBase ${snap.prodBase})`
            : ''),
      );
    }
  }

  console.log('\nSnap-count ingestion complete.');
}

run()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => client.end());
