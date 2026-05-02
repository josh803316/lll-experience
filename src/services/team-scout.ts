import {getDB} from '../db/index.js';
import {officialDraftResults} from '../db/schema.js';
import {gte, lte, and, sql} from 'drizzle-orm';
import {
  LLLRatingEngine,
  canonicalTeam,
  EXPECTED_VALUE_BY_ROUND,
  CONTRACT_BONUSES,
  PlayerPerformanceRegistry,
} from './lll-rating-engine.js';
import type {StatModelId} from '../config/analyzer-stat-models.js';
import {DEFAULT_STAT_MODEL} from '../config/analyzer-stat-models.js';
import {DRAFT_SLOT_TRADE_VALUES} from '../config/draft-slot-trade-values.js';

const LATEST_FAIR_DRAFT_YEAR = 2023;

/** Earliest NFL season year offered in Single Season view (raised if DB has no older draft rows). */
export const ANALYZER_SINGLE_SEASON_MIN_YEAR = 2015;

/** Draft-capital weight: early rounds matter more for the premium lens (round 1 ≈ weight 7). */
export function pickCapitalWeight(round: number): number {
  const r = Math.min(Math.max(round, 1), 7);
  return Math.max(0.5, 8 - r);
}

/**
 * Trade-chart weight for the actual draft slot (overall pick → slot within round).
 * Falls back to {@link pickCapitalWeight} when pick number is missing or out of range.
 */
export function pickSlotTradeWeight(round: number, overallPick: number | null): number {
  const r = Math.min(Math.max(Math.floor(round), 1), 7);
  if (overallPick == null || !Number.isFinite(overallPick)) {
    return pickCapitalWeight(round);
  }
  const pn = Math.floor(overallPick);
  const slot = Math.min(Math.max(pn - (r - 1) * 32, 1), 32);
  const row = DRAFT_SLOT_TRADE_VALUES[r - 1];
  const w = row?.[slot - 1];
  if (w === undefined || !Number.isFinite(w)) {
    return pickCapitalWeight(round);
  }
  return w;
}

/**
 * Scalar used to rank picks under the active lens (Δ for baseline/shrinkage/expert modes; Δ·w for premium/slot).
 */
export function pickLensMetric(
  delta: number,
  round: number,
  pickNumber: number | null,
  statModel: StatModelId | undefined,
): number {
  const m = statModel ?? DEFAULT_STAT_MODEL;
  if (m === 'premium') {
    return delta * pickCapitalWeight(round);
  }
  if (m === 'slot_value') {
    return delta * pickSlotTradeWeight(round, pickNumber);
  }
  return delta;
}

/** Δ × weight for Franchise Index / Movers / players sort when a weighted lens is selected. */
export function pickStatLensScore(p: ScoredPick, statModel: StatModelId | undefined): number {
  return pickLensMetric(p.delta, p.round, p.pickNumber, statModel);
}
const DEFAULT_WINDOW = 6;

export const TEAM_WINDOW_DEFAULT = DEFAULT_WINDOW;
export const TEAM_WINDOW_END_DEFAULT = LATEST_FAIR_DRAFT_YEAR;

/**
 * Min/max draft years in `official_draft_results` for the season dropdown.
 * `min` is at least `ANALYZER_SINGLE_SEASON_MIN_YEAR` but not lower than the oldest row.
 */
export async function getOfficialDraftYearBounds(): Promise<{min: number; max: number}> {
  const db = getDB();
  const [row] = await db
    .select({
      minY: sql<number | null>`MIN(${officialDraftResults.year})`,
      maxY: sql<number | null>`MAX(${officialDraftResults.year})`,
    })
    .from(officialDraftResults);

  const rawMin = row?.minY ?? ANALYZER_SINGLE_SEASON_MIN_YEAR;
  const rawMax = row?.maxY ?? LATEST_FAIR_DRAFT_YEAR;
  const min = Math.max(ANALYZER_SINGLE_SEASON_MIN_YEAR, rawMin);
  const max = Math.max(min, rawMax);
  return {min, max};
}

/** Descending years for `<select>` (newest first). */
export function buildDescendingSeasonYears(minYear: number, maxYear: number): number[] {
  const lo = Math.min(minYear, maxYear);
  const hi = Math.max(minYear, maxYear);
  const years: number[] = [];
  for (let y = hi; y >= lo; y--) {
    years.push(y);
  }
  return years;
}

export type ScoutMode = 'career' | 'season';

export interface ScoutOptions {
  mode?: ScoutMode;
  season?: number;
  window?: number;
  endYear?: number;
  /** Statistical lens for team/mover rankings (Franchise Index). */
  statModel?: StatModelId;
}

export function resolveScoutYearRange(opts: ScoutOptions & {draftYear?: number}): {startYear: number; endYear: number} {
  if (opts.mode === 'season' && opts.season !== undefined) {
    return {startYear: opts.season, endYear: opts.season};
  }
  const window = opts.window ?? DEFAULT_WINDOW;
  const endYear = opts.endYear ?? LATEST_FAIR_DRAFT_YEAR;
  const startYear = opts.draftYear ?? endYear - window + 1;
  const stopYear = opts.draftYear ?? endYear;
  return {startYear, endYear: stopYear};
}

export interface ScoredPick {
  name: string;
  team: string;
  teamKey: string;
  round: number;
  pickNumber: number | null;
  year: number;
  position: string | null;
  rating: number;
  contractOutcome: string | null;
  contractBonus: number;
  performanceScore: number;
  expected: number;
  delta: number;
  outcome: string;
}

export interface TeamSuccessRow {
  teamKey: string;
  team: string;
  totalPicks: number;
  hits: number;
  busts: number;
  eliteCount: number;
  /** Unique player names with LLL career rating ≥ 8.0 in this window (for tooltips). */
  eliteNames: string[];
  hitRate: number;
  avgDelta: number;
  value: number;
  grade: string;
  topPick?: {name: string; rating: number; delta: number; round: number; year: number};
  worstPick?: {name: string; rating: number; delta: number; round: number; year: number};
}

export type PickOutcome = 'ELITE HIT' | 'HIT' | 'MET EXPECTATION' | 'UNDERPERFORMED' | 'BUST' | 'PENDING';

export interface BreakdownPick {
  name: string;
  round: number;
  pickNumber: number;
  position: string | null;
  outcome: PickOutcome;
}

export interface BreakdownYear {
  year: number;
  color: 'green' | 'orange' | 'red' | 'gray';
  hits: number;
  busts: number;
  pendingCount: number;
  picks: BreakdownPick[];
  headline: string;
}

export interface TeamBreakdown {
  teamKey: string;
  team: string;
  grade: string;
  rank: number;
  totalTeams: number;
  totalPicks: number;
  hits: number;
  busts: number;
  eliteCount: number;
  eliteNames: string[];
  bestPicks: Array<{name: string; round: number; year: number; outcome: PickOutcome}>;
  worstPicks: Array<{name: string; round: number; year: number; outcome: PickOutcome}>;
  topPick?: {name: string; round: number; year: number; outcome: PickOutcome};
  worstPick?: {name: string; round: number; year: number; outcome: PickOutcome};
  windowStart: number;
  windowEnd: number;
  years: BreakdownYear[];
}

/** Prototype: empirical-Bayes-style shrinkage of per-year average pick delta toward the league mean. */
export interface TeamYearShrinkageRow {
  teamKey: string;
  team: string;
  year: number;
  pickCount: number;
  rawAvgDelta: number;
  shrunkAvgDelta: number;
  globalMean: number;
  /** Prior effective sample size; larger = more pull toward `globalMean`. */
  shrinkageK: number;
}

export interface TeamYearShrinkageResult {
  rows: TeamYearShrinkageRow[];
  globalMean: number;
  globalPickCount: number;
  shrinkageK: number;
}

function colorForYear(picks: BreakdownPick[]): BreakdownYear['color'] {
  const rated = picks.filter((p) => p.outcome !== 'PENDING');
  if (rated.length === 0) {
    return 'gray';
  }
  const hits = rated.filter((p) => p.outcome === 'ELITE HIT' || p.outcome === 'HIT').length;
  const busts = rated.filter((p) => p.outcome === 'BUST').length;
  if (hits >= 1 && busts <= hits) {
    return 'green';
  }
  if (busts >= 2 && hits === 0) {
    return 'red';
  }
  return 'orange';
}

function headlineForYear(picks: BreakdownPick[]): string {
  const elite = picks.find((p) => p.outcome === 'ELITE HIT');
  if (elite) {
    return `${elite.name} broke the class open.`;
  }
  const hit = picks.find((p) => p.outcome === 'HIT');
  if (hit) {
    return `${hit.name} carried the year.`;
  }
  const premiumBust = picks.find((p) => p.outcome === 'BUST' && p.round <= 2);
  if (premiumBust) {
    return `${premiumBust.name} (R${premiumBust.round}) burned premium capital.`;
  }
  const anyBust = picks.find((p) => p.outcome === 'BUST');
  if (anyBust) {
    return `Late-round swings missed.`;
  }
  const met = picks.filter((p) => p.outcome === 'MET EXPECTATION').length;
  if (met >= 2) {
    return `Class hit its number, no upside.`;
  }
  if (picks.every((p) => p.outcome === 'PENDING')) {
    return `Class still developing.`;
  }
  return `Quiet class — no breakouts.`;
}

/**
 * High-performance scouter for teams.
 */
export class TeamScoutService {
  /**
   * Aggregate every team's draft picks across a fair window and grade them
   * against per-round expected value.
   */
  static async getTeamSuccessLeaderboard(opts: ScoutOptions = {}): Promise<TeamSuccessRow[]> {
    const {startYear, endYear} = resolveScoutYearRange(opts);
    const useContractBonus = (opts.mode ?? 'career') === 'career';
    const statModel = opts.statModel ?? DEFAULT_STAT_MODEL;

    const db = getDB();

    // 1. Use centralized registry (eliminates redundant O(N) calculations)
    const [lookupMap, picks] = await Promise.all([
      PlayerPerformanceRegistry.getCareerRatingMap(),
      db
        .select({
          playerName: officialDraftResults.playerName,
          teamName: officialDraftResults.teamName,
          round: officialDraftResults.round,
          pickNumber: officialDraftResults.pickNumber,
          contractOutcome: officialDraftResults.contractOutcome,
          year: officialDraftResults.year,
        })
        .from(officialDraftResults)
        .where(and(gte(officialDraftResults.year, startYear), lte(officialDraftResults.year, endYear))),
    ]);

    const allPickDeltas: number[] = [];

    const teamAgg: Record<
      string,
      {
        city: string;
        name: string;
        totalPicks: number;
        hits: number;
        busts: number;
        eliteCount: number;
        eliteNameSet: Set<string>;
        deltaSum: number;
        premiumWeighted: number;
        premiumW: number;
        slotWeighted: number;
        slotW: number;
        bestLens: number;
        bestPick?: TeamSuccessRow['topPick'];
        worstLens: number;
        worstPick?: TeamSuccessRow['worstPick'];
      }
    > = {};

    for (const p of picks) {
      const team = canonicalTeam(p.teamName);
      if (!team || !p.round || !p.playerName) {
        continue;
      }

      const rating = lookupMap.get(LLLRatingEngine.normalizeName(p.playerName)) ?? null;
      if (rating === null) {
        continue;
      }

      const perf = LLLRatingEngine.applyContractBonus(rating, useContractBonus ? p.contractOutcome : null);
      const delta = LLLRatingEngine.calculateFinalGrade(perf, p.round);
      const normalizedRating = rating;
      allPickDeltas.push(delta);

      const cw = pickCapitalWeight(p.round);
      const sw = pickSlotTradeWeight(p.round, p.pickNumber);

      const key = team.abbr;
      if (!teamAgg[key]) {
        teamAgg[key] = {
          city: team.city,
          name: team.name,
          totalPicks: 0,
          hits: 0,
          busts: 0,
          eliteCount: 0,
          eliteNameSet: new Set<string>(),
          deltaSum: 0,
          premiumWeighted: 0,
          premiumW: 0,
          slotWeighted: 0,
          slotW: 0,
          bestLens: -Infinity,
          worstLens: Infinity,
        };
      }
      const agg = teamAgg[key];
      agg.totalPicks++;
      agg.deltaSum += delta;
      agg.premiumWeighted += delta * cw;
      agg.premiumW += cw;
      agg.slotWeighted += delta * sw;
      agg.slotW += sw;
      if (delta > 0.5) {
        agg.hits++;
      }
      if (delta < -1.0) {
        agg.busts++;
      }
      if (rating >= 8.0) {
        agg.eliteCount++;
        agg.eliteNameSet.add(p.playerName);
      }

      const lm = pickLensMetric(delta, p.round, p.pickNumber, statModel);
      if (lm > agg.bestLens) {
        agg.bestLens = lm;
        agg.bestPick = {name: p.playerName, rating: normalizedRating, delta, round: p.round, year: p.year};
      }
      if (lm < agg.worstLens) {
        agg.worstLens = lm;
        agg.worstPick = {name: p.playerName, rating: normalizedRating, delta, round: p.round, year: p.year};
      }
    }

    const globalMean = allPickDeltas.length > 0 ? allPickDeltas.reduce((s, d) => s + d, 0) / allPickDeltas.length : 0;
    const shrinkK = 4;

    const interim = Object.entries(teamAgg).map(([abbr, a]) => {
      const rawAvg = a.deltaSum / a.totalPicks;
      const avgDelta = Number(rawAvg.toFixed(2));
      const premiumAvg = a.premiumW > 0 ? Number((a.premiumWeighted / a.premiumW).toFixed(2)) : avgDelta;
      const slotAvg = a.slotW > 0 ? Number((a.slotWeighted / a.slotW).toFixed(2)) : avgDelta;
      const shrunkAvg = Number(
        (
          (a.totalPicks / (a.totalPicks + shrinkK)) * rawAvg +
          (shrinkK / (a.totalPicks + shrinkK)) * globalMean
        ).toFixed(2),
      );
      let lensDelta = avgDelta;
      if (statModel === 'shrinkage') {
        lensDelta = shrunkAvg;
      } else if (statModel === 'premium') {
        lensDelta = premiumAvg;
      } else if (statModel === 'slot_value') {
        lensDelta = slotAvg;
      }
      const hitRate = Math.round((a.hits / a.totalPicks) * 100);
      return {abbr, a, avgDelta, premiumAvg, shrunkAvg, lensDelta, hitRate};
    });

    interim.sort((x, y) => y.lensDelta - x.lensDelta);

    const lensDeltas = interim.map((i) => i.lensDelta);
    const maxD = Math.max(...lensDeltas);
    const minD = Math.min(...lensDeltas);
    const span = Math.max(0.01, maxD - minD);

    return interim.map((i, idx) => ({
      teamKey: i.abbr,
      team: `${i.a.city} ${i.a.name}`,
      totalPicks: i.a.totalPicks,
      hits: i.a.hits,
      busts: i.a.busts,
      eliteCount: i.a.eliteCount,
      eliteNames: Array.from(i.a.eliteNameSet).sort((a, b) => a.localeCompare(b)),
      hitRate: i.hitRate,
      avgDelta: i.lensDelta,
      value: Math.round(((i.lensDelta - minD) / span) * 100),
      grade: LLLRatingEngine.rankToLetterGrade(idx + 1, interim.length),
      topPick: i.a.bestPick,
      worstPick: i.a.worstPick,
    }));
  }

  /**
   * Score every pick in the requested window/mode and return the full list,
   * sorted desc by delta. Used by both `getTopMovers` (slice) and the
   * /analyzer/players grid (paginate + sort).
   */
  static async getAllScoredPicks(opts: ScoutOptions & {draftYear?: number} = {}): Promise<ScoredPick[]> {
    const {startYear, endYear} = resolveScoutYearRange(opts);
    const useContractBonus = (opts.mode ?? 'career') === 'career';

    const db = getDB();
    const [lookupMap, picks] = await Promise.all([
      PlayerPerformanceRegistry.getCareerRatingMap(),
      db
        .select()
        .from(officialDraftResults)
        .where(and(gte(officialDraftResults.year, startYear), lte(officialDraftResults.year, endYear))),
    ]);

    const scored: ScoredPick[] = [];
    for (const p of picks) {
      const team = canonicalTeam(p.teamName);
      if (!team || !p.round || !p.playerName) {
        continue;
      }
      const rating = lookupMap.get(LLLRatingEngine.normalizeName(p.playerName)) ?? null;
      if (rating === null) {
        continue;
      }

      const contractBonus = useContractBonus && p.contractOutcome ? (CONTRACT_BONUSES[p.contractOutcome] ?? 0) : 0;
      const perf = LLLRatingEngine.applyContractBonus(rating, useContractBonus ? p.contractOutcome : null);
      const delta = LLLRatingEngine.calculateFinalGrade(perf, p.round);
      const outcome = LLLRatingEngine.getGradeOutcomeLabel(delta);

      scored.push({
        name: p.playerName,
        team: `${team.city} ${team.name}`,
        teamKey: team.abbr,
        round: p.round,
        pickNumber: p.pickNumber,
        year: p.year,
        position: p.position,
        rating,
        contractOutcome: p.contractOutcome ?? null,
        contractBonus,
        performanceScore: perf,
        expected: EXPECTED_VALUE_BY_ROUND[p.round] ?? 0,
        delta,
        outcome,
      });
    }

    scored.sort((a, b) => b.delta - a.delta);
    return scored;
  }

  /**
   * Top hits & busts across the league.
   */
  static async getTopMovers(opts: ScoutOptions & {draftYear?: number; limit?: number} = {}) {
    const limit = opts.limit ?? 10;
    const statModel = opts.statModel ?? DEFAULT_STAT_MODEL;
    const scored = await TeamScoutService.getAllScoredPicks(opts);

    const lensScore = (p: ScoredPick) => pickStatLensScore(p, statModel);

    const byLensDesc = [...scored].sort((a, b) => lensScore(b) - lensScore(a));
    const byLensAsc = [...scored].sort((a, b) => lensScore(a) - lensScore(b));

    return {
      topHits: byLensDesc.slice(0, limit),
      topBusts: byLensAsc.slice(0, limit),
    };
  }

  /**
   * Per-team explainer used by the dashboard modal.
   */
  static async getTeamBreakdown(teamKey: string, opts: ScoutOptions = {}): Promise<TeamBreakdown | null> {
    const {startYear, endYear} = resolveScoutYearRange(opts);
    const useContractBonus = (opts.mode ?? 'career') === 'career';

    const leaderboard = await TeamScoutService.getTeamSuccessLeaderboard(opts);
    const targetKey = teamKey.toUpperCase();
    const idx = leaderboard.findIndex((t) => t.teamKey === targetKey);
    if (idx === -1) {
      return null;
    }
    const row = leaderboard[idx];

    const db = getDB();

    const [lookupMap, allPicks] = await Promise.all([
      PlayerPerformanceRegistry.getCareerRatingMap(),
      db
        .select()
        .from(officialDraftResults)
        .where(and(gte(officialDraftResults.year, startYear), lte(officialDraftResults.year, endYear))),
    ]);

    const myPicks = allPicks.filter((p) => canonicalTeam(p.teamName)?.abbr === targetKey);

    const yearMap = new Map<number, BreakdownPick[]>();
    let eliteCount = 0;
    const eliteNameSet = new Set<string>();

    for (const p of myPicks) {
      if (!p.round || !p.playerName || !p.pickNumber) {
        continue;
      }

      const rating = lookupMap.get(LLLRatingEngine.normalizeName(p.playerName)) ?? null;

      let outcome: PickOutcome = 'PENDING';
      if (rating !== null) {
        const perf = LLLRatingEngine.applyContractBonus(rating, useContractBonus ? p.contractOutcome : null);
        const delta = LLLRatingEngine.calculateFinalGrade(perf, p.round);
        outcome = LLLRatingEngine.getGradeOutcomeLabel(delta) as PickOutcome;

        if (rating >= 8.0) {
          eliteCount++;
          eliteNameSet.add(p.playerName);
        }
      }

      const breakdown: BreakdownPick = {
        name: p.playerName,
        round: p.round,
        pickNumber: p.pickNumber,
        position: p.position,
        outcome,
      };

      const yearList = yearMap.get(p.year) ?? [];
      yearList.push(breakdown);
      yearMap.set(p.year, yearList);
    }

    const statModel = opts.statModel ?? DEFAULT_STAT_MODEL;
    const teamScored = (await TeamScoutService.getAllScoredPicks(opts)).filter((p) => p.teamKey === targetKey);
    const lensScoreMap = new Map<string, number>();
    for (const sp of teamScored) {
      lensScoreMap.set(`${sp.year}::${sp.name}`, pickLensMetric(sp.delta, sp.round, sp.pickNumber, statModel));
    }

    const years: BreakdownYear[] = Array.from(yearMap.entries())
      .map(([year, picks]) => {
        const sortedPicks = [...picks].sort((a, b) => {
          const va = lensScoreMap.get(`${year}::${a.name}`) ?? -Infinity;
          const vb = lensScoreMap.get(`${year}::${b.name}`) ?? -Infinity;
          if (vb !== va) {
            return vb - va;
          }
          return a.round - b.round;
        });
        const hits = sortedPicks.filter((p) => p.outcome === 'ELITE HIT' || p.outcome === 'HIT').length;
        const busts = sortedPicks.filter((p) => p.outcome === 'BUST').length;
        const pendingCount = sortedPicks.filter((p) => p.outcome === 'PENDING').length;
        return {
          year,
          color: colorForYear(sortedPicks),
          hits,
          busts,
          pendingCount,
          picks: sortedPicks,
          headline: headlineForYear(sortedPicks),
        };
      })
      .sort((a, b) => b.year - a.year);

    const lensCmp = (a: ScoredPick, b: ScoredPick) =>
      pickLensMetric(b.delta, b.round, b.pickNumber, statModel) -
      pickLensMetric(a.delta, a.round, a.pickNumber, statModel);
    const lensCmpWorst = (a: ScoredPick, b: ScoredPick) =>
      pickLensMetric(a.delta, a.round, a.pickNumber, statModel) -
      pickLensMetric(b.delta, b.round, b.pickNumber, statModel);

    const bestPicks = [...teamScored]
      .sort(lensCmp)
      .slice(0, 5)
      .map((p) => ({
        name: p.name,
        round: p.round,
        year: p.year,
        outcome: p.outcome as PickOutcome,
      }));
    const worstPicks = [...teamScored]
      .sort(lensCmpWorst)
      .slice(0, 5)
      .map((p) => ({
        name: p.name,
        round: p.round,
        year: p.year,
        outcome: p.outcome as PickOutcome,
      }));

    return {
      teamKey: row.teamKey,
      team: row.team,
      grade: row.grade,
      rank: idx + 1,
      totalTeams: leaderboard.length,
      totalPicks: row.totalPicks,
      hits: row.hits,
      busts: row.busts,
      eliteCount,
      eliteNames: Array.from(eliteNameSet).sort((a, b) => a.localeCompare(b)),
      bestPicks,
      worstPicks,
      topPick: bestPicks[0],
      worstPick: worstPicks[0],
      windowStart: startYear,
      windowEnd: endYear,
      years,
    };
  }

  /**
   * Prototype: for each (team, draft year), shrink the average pick delta toward the
   * window-wide mean of all pick deltas — small-N classes pull toward the league to
   * reduce noise (James–Stein / partial-pooling intuition).
   */
  static async getTeamYearShrinkagePrototype(
    opts: ScoutOptions & {draftYear?: number} = {},
    shrinkageK = 4,
  ): Promise<TeamYearShrinkageResult> {
    const scored = await TeamScoutService.getAllScoredPicks(opts);
    if (scored.length === 0) {
      return {rows: [], globalMean: 0, globalPickCount: 0, shrinkageK};
    }

    const allDeltas = scored.map((p) => p.delta);
    const globalMean = allDeltas.reduce((a, b) => a + b, 0) / allDeltas.length;

    const byKey = new Map<string, {teamKey: string; team: string; year: number; deltas: number[]}>();
    for (const p of scored) {
      const k = `${p.teamKey}::${p.year}`;
      const cur = byKey.get(k);
      if (cur) {
        cur.deltas.push(p.delta);
      } else {
        byKey.set(k, {teamKey: p.teamKey, team: p.team, year: p.year, deltas: [p.delta]});
      }
    }

    const k = shrinkageK;
    const rows: TeamYearShrinkageRow[] = [];
    for (const g of byKey.values()) {
      const n = g.deltas.length;
      const sum = g.deltas.reduce((a, b) => a + b, 0);
      const rawAvgDelta = Number((sum / n).toFixed(3));
      const shrunkAvgDelta = Number(((n / (n + k)) * rawAvgDelta + (k / (n + k)) * globalMean).toFixed(3));
      rows.push({
        teamKey: g.teamKey,
        team: g.team,
        year: g.year,
        pickCount: n,
        rawAvgDelta,
        shrunkAvgDelta,
        globalMean: Number(globalMean.toFixed(3)),
        shrinkageK: k,
      });
    }

    rows.sort((a, b) => b.shrunkAvgDelta - a.shrunkAvgDelta);
    return {
      rows,
      globalMean: Number(globalMean.toFixed(3)),
      globalPickCount: allDeltas.length,
      shrinkageK: k,
    };
  }
}
