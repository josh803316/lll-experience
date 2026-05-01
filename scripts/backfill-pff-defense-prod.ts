/**
 * Backfill defensive production rows in player_performance_ratings from PFF
 * CSVs. Necessary because nflverse's combined player_stats_def.csv currently
 * lags one season — as of 2026-05 it ends at 2024, so every 2025 defender
 * (Warner, Will Anderson Jr., Bobby Wagner, etc.) was missing a per-season
 * production rating despite appearing in PFF.
 *
 * Strategy: read pff_downloads/{season}_defense.csv for any season we have on
 * disk, map PFF columns onto the same DefStats shape ingest-season-ratings.ts
 * uses, run the same defensiveProdScore formula, and upsert the per-season
 * row. Existing snap metadata is preserved so a follow-up run of
 * ingest-snap-counts.ts continues to work.
 *
 * Idempotent. Re-running updates the same (player, season) row.
 *
 * Run: bun run --env-file=.env.local scripts/backfill-pff-defense-prod.ts
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

// ── Mirrors ingest-season-ratings.ts: same DefStats shape, same formula ─────

interface DefStats {
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
}

function defensiveProdScore(s: DefStats, position: string): number {
  const p = position.toUpperCase();
  if (['LB', 'OLB', 'ILB', 'MLB', 'DE', 'DL', 'DT', 'NT', 'EDGE', 'ED', 'DI'].includes(p)) {
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
  return Math.min(10, Math.max(0, Number((prodScore * (10 / 15)).toFixed(2))));
}

function applyCareerBonus(rating: number, yearsInNFL: number): number {
  const bonus = Math.min(1.0, Math.max(0, (yearsInNFL - 2) * 0.25));
  return Math.min(10, Number((rating + bonus).toFixed(2)));
}

// Mirror of snapShareToRating from ingest-snap-counts.ts. We need it here so
// the rating we write merges prod and snap the same way the original pipeline
// does — otherwise an injured starter (Warner '25: 6g, 84.8% def) would land
// at his prod-only rating of 2.4 instead of his snap-share rating of 7.0.
function snapShareToRating(snapPct: number): number {
  if (snapPct >= 0.9) {
    return 7;
  }
  if (snapPct >= 0.7) {
    return 6;
  }
  if (snapPct >= 0.5) {
    return 5;
  }
  if (snapPct >= 0.3) {
    return 4;
  }
  if (snapPct >= 0.15) {
    return 3;
  }
  if (snapPct > 0) {
    return 2;
  }
  return 0;
}

// ── PFF position → nflverse-style position used for prodScore weighting ─────
// PFF tags edge/interior; the formula keys edge as front-7 and CB/S as
// secondary. ED → EDGE, DI → DT keeps both buckets right.

function normalizePos(pffPos: string): string {
  const p = pffPos.toUpperCase();
  if (p === 'ED') {
    return 'EDGE';
  }
  if (p === 'DI') {
    return 'DT';
  }
  return p;
}

// ── CSV parsing ────────────────────────────────────────────────────────────

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

function loadCsv(path: string): {headers: string[]; rows: Record<string, string>[]} {
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
  return {headers, rows};
}

function num(v: string | undefined): number {
  if (!v) {
    return 0;
  }
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

// ── Main ───────────────────────────────────────────────────────────────────

async function run() {
  console.log('--- PFF defensive production backfill ---');

  // 1. Drafted-player index (by normalized name → canonical name + draft year).
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

  // 2. Find every {season}_defense.csv we have on disk.
  const downloads = join(process.cwd(), 'pff_downloads');
  const seasons = readdirSync(downloads)
    .filter((f) => /^\d{4}_defense\.csv$/.test(f))
    .map((f) => parseInt(f.slice(0, 4), 10))
    .sort();
  console.log(`Defense CSVs available: ${seasons.join(', ')}`);

  // 3. Process each season.
  type Row = {
    playerName: string;
    draftYear: number;
    season: number;
    position: string;
    stats: DefStats;
    prodScore: number;
    prodBase: number;
    yearsInNFL: number;
    rating: number;
  };
  const toUpsert: Row[] = [];

  for (const season of seasons) {
    const path = join(downloads, `${season}_defense.csv`);
    if (!existsSync(path)) {
      continue;
    }

    const {rows} = loadCsv(path);
    let matched = 0;
    let skippedUndrafted = 0;
    let skippedNoProd = 0;

    for (const r of rows) {
      const playerName = r.player;
      if (!playerName) {
        continue;
      }
      const draftedRec = draftedByName.get(LLLRatingEngine.normalizeName(playerName));
      if (!draftedRec) {
        skippedUndrafted++;
        continue;
      }
      const position = normalizePos(r.position || '');
      // Map PFF defense columns → DefStats. PFF: tackles=solo, assists=assist,
      // hits=qb_hits, pass_break_ups=pass_defended, forced_fumbles=fumbles_forced,
      // fumble_recoveries=fumbles_recovered, touchdowns=def_tds (all forms).
      const stats: DefStats = {
        tackles_solo: num(r.tackles),
        tackles_assist: num(r.assists),
        tackles_for_loss: num(r.tackles_for_loss),
        sacks: num(r.sacks),
        qb_hits: num(r.hits),
        pass_defended: num(r.pass_break_ups),
        interceptions: num(r.interceptions),
        fumbles_forced: num(r.forced_fumbles),
        fumbles_recovered: num(r.fumble_recoveries),
        def_tds: num(r.touchdowns),
        games: num(r.player_game_count),
      };
      const prodScore = defensiveProdScore(stats, position);
      if (prodScore <= 0) {
        skippedNoProd++;
        continue;
      }
      const baseRating = seasonScoreToRating(prodScore);
      const yearsInNFL = Math.max(1, season - draftedRec.draftYear + 1);
      // We compute the prod-only rating up front; the snap merge happens at
      // upsert time when we can read the existing snap block from the DB.
      const prodOnlyRating = applyCareerBonus(baseRating, yearsInNFL);
      toUpsert.push({
        playerName: draftedRec.playerName,
        draftYear: draftedRec.draftYear,
        season,
        position,
        stats,
        prodScore: Number(prodScore.toFixed(2)),
        prodBase: baseRating,
        yearsInNFL,
        rating: prodOnlyRating,
      });
      matched++;
    }
    console.log(
      `  ${season}: ${rows.length} CSV rows · ${matched} matched & scored · ${skippedUndrafted} undrafted · ${skippedNoProd} zero-prod`,
    );
  }

  console.log(`Total rows to upsert: ${toUpsert.length}`);

  // 4. Upsert. We need to merge metadata so any existing snap block survives.
  //    Drizzle doesn't have a JSON-merge helper, so we read existing rows for
  //    the (player, season) keys we'll touch, then write them back manually.

  // Build a lookup of existing rows for the (player, season) pairs we care about.
  const existing = await db
    .select({
      id: playerPerformanceRatings.id,
      playerName: playerPerformanceRatings.playerName,
      evaluationYear: playerPerformanceRatings.evaluationYear,
      metadata: playerPerformanceRatings.metadata,
    })
    .from(playerPerformanceRatings)
    .where(eq(playerPerformanceRatings.isCareerRating, false));
  const existingByKey = new Map<string, (typeof existing)[number]>();
  for (const e of existing) {
    existingByKey.set(`${e.playerName}::${e.evaluationYear}`, e);
  }

  let inserted = 0;
  let updated = 0;
  let skippedHasNflverse = 0;
  const CHUNK = 200;
  for (let i = 0; i < toUpsert.length; i += CHUNK) {
    const slice = toUpsert.slice(i, i + CHUNK);
    await Promise.all(
      slice.map(async (r) => {
        const k = `${r.playerName}::${r.season}`;
        const ex = existingByKey.get(k);

        // Don't clobber nflverse-sourced data. If the existing row's prodScore
        // came from nflverse (no `source` tag, or anything other than 'pff'),
        // leave it alone — this backfill is a fallback for seasons where
        // nflverse defensive data isn't available yet. Re-running our own PFF
        // backfill is fine, so rows we wrote previously can be recomputed.
        if (ex) {
          const meta = (ex.metadata as Record<string, unknown> | null) ?? {};
          const hasProd = typeof meta.prodScore === 'number' && meta.prodScore > 0;
          const isFromPff = meta.source === 'pff';
          if (hasProd && !isFromPff) {
            skippedHasNflverse++;
            return;
          }
        }

        const existingMeta = (ex?.metadata as Record<string, unknown> | null) ?? {};

        // Merge with snap data if it's already been ingested for this row.
        // ingest-snap-counts.ts uses max(prodBase, snapBase) + career bonus,
        // and we mirror that here so the rating doesn't regress for an
        // injured starter (e.g. Warner '25: 6g of high-snap-share play
        // should land at the snap-driven 7.0, not the prod-only 2.4).
        const existingSnap = existingMeta.snap as
          | {offPct?: number; defPct?: number; stPct?: number; dominantSide?: string}
          | undefined;
        let snapBase = 0;
        if (existingSnap) {
          const dominantPct =
            existingSnap.dominantSide === 'OFF'
              ? (existingSnap.offPct ?? 0)
              : existingSnap.dominantSide === 'ST'
                ? (existingSnap.stPct ?? 0)
                : (existingSnap.defPct ?? 0);
          snapBase = snapShareToRating(dominantPct);
        }
        const mergedBase = Math.max(r.prodBase, snapBase);
        const mergedRating = applyCareerBonus(mergedBase, r.yearsInNFL);

        const newMeta: Record<string, unknown> = {
          ...existingMeta,
          side: 'DEF',
          games: r.stats.games,
          stats: r.stats,
          prodScore: r.prodScore,
          source: 'pff',
        };
        // Keep the snap block's prodBase up to date so a future re-run of
        // ingest-snap-counts.ts converges on the same rating.
        if (existingSnap) {
          newMeta.snap = {...existingSnap, prodBase: r.prodBase};
        }
        const justification = `Season ${r.season} production (${r.position}, PFF) → max(prod ${r.prodBase.toFixed(2)}, snap ${snapBase.toFixed(2)}) + career bonus`;

        if (ex) {
          await db
            .update(playerPerformanceRatings)
            .set({rating: mergedRating, metadata: newMeta, justification})
            .where(eq(playerPerformanceRatings.id, ex.id));
          updated++;
        } else {
          await db.insert(playerPerformanceRatings).values({
            playerName: r.playerName,
            draftYear: r.draftYear,
            evaluationYear: r.season,
            rating: mergedRating,
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
  console.log(
    `\nUpdated ${updated}, inserted ${inserted}, skipped ${skippedHasNflverse} (already have nflverse prod data).`,
  );

  // 5. Sanity check.
  const checks = ['Fred Warner', 'Will Anderson Jr.', 'Bobby Wagner', 'Khalil Mack'];
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
      const prod = (m.prodScore as number | undefined)?.toFixed(2) ?? '—';
      console.log(
        `  ${r.evaluationYear}: rating=${r.rating}  games=${games}  prod=${prod}  src=${(m.source as string) ?? 'nflverse'}`,
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
