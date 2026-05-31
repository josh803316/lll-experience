/**
 * Analyzer result cache (Postgres-backed, no Redis).
 *
 * The expert leaderboards (oracle/scout/takes/pairwise/blend) are expensive to
 * compute but change only when source data changes (PFF/nflverse ingest, expert
 * ranking imports, official draft-result syncs). They are also parameter-free,
 * so the whole set is one cache entry.
 *
 * Strategy:
 *  - analyzer_data_version holds a counter that DB triggers bump on every write
 *    to player_performance_ratings / expert_rankings / official_draft_results.
 *  - analyzer_cache stores the computed bundle as JSON, tagged with the version
 *    it was computed against.
 *  - A read is fresh iff its data_version === the current version. Steady state
 *    is two indexed SELECTs (single-digit ms) instead of ~13 concurrent heavy
 *    queries + the ~6s cold career-rating-map build.
 *  - On a miss/stale read we recompute, store, and serve (lazy, always correct).
 *  - warmAnalyzerCache() recomputes eagerly after an ingest so no user waits.
 */
import {sql} from 'drizzle-orm';
import {eq} from 'drizzle-orm';
import {getDB} from '../db/index.js';
import {analyzerCache, analyzerDataVersion} from '../db/schema.js';
import {
  ExpertAuditService,
  type ExpertOracleRow,
  type ExpertScoutRow,
  type ExpertBlendRow,
  type Take,
} from './expert-audit.js';
import {ExpertPairwiseRankService, type ExpertPairwiseRow} from './expert-pairwise-rank.js';
import {PlayerPerformanceRegistry} from './lll-rating-engine.js';

const EXPERT_BUNDLE_KEY = 'experts-bundle';

export interface ExpertBundle {
  oracle: ExpertOracleRow[];
  scout: ExpertScoutRow[];
  takes: {best: Take[]; worst: Take[]};
  pairwise: ExpertPairwiseRow[];
  blend: ExpertBlendRow[];
}

/** Last data version this process computed/served — used to keep the in-process
 * career-rating-map (L1) coherent across version bumps. */
let lastSeenVersion = 0;

/** Current data version. Defaults to 1 if the seed row is somehow missing. */
async function getDataVersion(): Promise<number> {
  const db = getDB();
  const [row] = await db
    .select({version: analyzerDataVersion.version})
    .from(analyzerDataVersion)
    .where(eq(analyzerDataVersion.id, 1))
    .limit(1);
  return row?.version ?? 1;
}

/** Drop the L1 career-map memo when the underlying data has changed, so a
 * recompute reads fresh ratings rather than a stale memoized map. */
function syncCareerMapToVersion(version: number) {
  if (version !== lastSeenVersion) {
    PlayerPerformanceRegistry.invalidate();
    lastSeenVersion = version;
  }
}

/** Compute the expert bundle from scratch (sequential — see analyzer.controller
 * /experts: concurrent fan-out starves the DB pool). */
async function computeExpertBundle(): Promise<ExpertBundle> {
  const oracle = await ExpertAuditService.getOracleLeaderboard();
  const scout = await ExpertAuditService.getScoutLeaderboard();
  const takes = await ExpertAuditService.getBestWorstTakes(10);
  const pairwise = await ExpertPairwiseRankService.getPairwiseLeaderboard();
  const blend = ExpertAuditService.blendLeaderboardFrom(oracle, scout, pairwise);
  return {oracle, scout, takes, pairwise, blend};
}

async function writeBundle(payload: ExpertBundle, version: number): Promise<void> {
  const db = getDB();
  await db
    .insert(analyzerCache)
    .values({key: EXPERT_BUNDLE_KEY, payload, dataVersion: version, computedAt: sql`now()`})
    .onConflictDoUpdate({
      target: analyzerCache.key,
      set: {payload, dataVersion: version, computedAt: sql`now()`},
    });
}

/**
 * Serve the expert bundle, recomputing only when the cache is missing or stale.
 * This replaces the direct leaderboard calls in the analyzer routes.
 */
export async function getExpertBundle(): Promise<ExpertBundle> {
  const db = getDB();
  const version = await getDataVersion();

  const [hit] = await db
    .select({payload: analyzerCache.payload, dataVersion: analyzerCache.dataVersion})
    .from(analyzerCache)
    .where(eq(analyzerCache.key, EXPERT_BUNDLE_KEY))
    .limit(1);

  if (hit && hit.dataVersion === version) {
    lastSeenVersion = version; // cache hit ⇒ L1 staleness is irrelevant here
    return hit.payload as ExpertBundle;
  }

  // miss/stale: data changed (or first run) — rebuild from fresh data and store.
  syncCareerMapToVersion(version);
  const payload = await computeExpertBundle();
  await writeBundle(payload, version);
  return payload;
}

/**
 * Eagerly recompute and store the bundle when stale, so the next request is a
 * pure cache hit. Safe to call repeatedly — it no-ops when already fresh (unless
 * force is set). Call after an ingest / data sync.
 */
export async function warmAnalyzerCache(opts: {force?: boolean} = {}): Promise<{
  warmed: boolean;
  version: number;
}> {
  const db = getDB();
  const version = await getDataVersion();

  if (!opts.force) {
    const [hit] = await db
      .select({dataVersion: analyzerCache.dataVersion})
      .from(analyzerCache)
      .where(eq(analyzerCache.key, EXPERT_BUNDLE_KEY))
      .limit(1);
    if (hit && hit.dataVersion === version) {
      return {warmed: false, version};
    }
  }

  syncCareerMapToVersion(version);
  const payload = await computeExpertBundle();
  await writeBundle(payload, version);
  return {warmed: true, version};
}
