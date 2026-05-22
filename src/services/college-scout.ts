import {getDB} from '../db/index.js';
import {officialDraftResults} from '../db/schema.js';
import {gte, lte, and, eq} from 'drizzle-orm';
import type {StatModelId, GradeFormulaId} from '../config/analyzer-stat-models.js';
import {DEFAULT_STAT_MODEL, DEFAULT_GRADE_FORMULA} from '../config/analyzer-stat-models.js';
import {
  pickCapitalWeight,
  pickLensMetric,
  pickSlotTradeWeight,
  resolveScoutYearRange,
  type ScoutMode,
} from './team-scout.js';
import {
  LLLRatingEngine,
  PlayerPerformanceRegistry,
  EXPECTED_VALUE_BY_ROUND,
  EXPECTED_TIER_BY_ROUND,
} from './lll-rating-engine.js';
import {MarketTierService, type MarketTierWeights} from './market-tier.js';

export interface CollegeSuccessRow {
  college: string;
  totalPicks: number;
  hits: number;
  busts: number;
  eliteCount: number;
  hitRate: number;
  avgDelta: number;
  value: number;
  topPro?: {name: string; rating: number; delta: number; round: number; year: number};
}

export interface CollegePickRow {
  playerName: string;
  round: number;
  pickNumber: number | null;
  year: number;
  position: string | null;
  rating: number;
  delta: number;
  outcome: string;
}

export interface CollegeScoutOptions {
  mode?: ScoutMode;
  season?: number;
  window?: number;
  statModel?: StatModelId;
  gradeFormula?: GradeFormulaId;
  marketWeights?: MarketTierWeights;
}

async function resolveCollegeRatingMap(opts: CollegeScoutOptions): Promise<{
  ratingFor: (name: string) => number | null;
  applyContractBonus: boolean;
  expectedByRound: Record<number, number>;
}> {
  if ((opts.statModel ?? DEFAULT_STAT_MODEL) === 'contract_aware') {
    const map = await MarketTierService.getTalentScoreMap(opts.marketWeights);
    return {
      ratingFor: (name: string) => map.get(LLLRatingEngine.normalizeName(name))?.talentScore ?? null,
      applyContractBonus: false,
      expectedByRound: EXPECTED_TIER_BY_ROUND,
    };
  }
  const map = await PlayerPerformanceRegistry.getCareerRatingMap();
  return {
    ratingFor: (name: string) => map.get(LLLRatingEngine.normalizeName(name)) ?? null,
    applyContractBonus: true,
    expectedByRound: EXPECTED_VALUE_BY_ROUND,
  };
}

export class CollegeScoutService {
  static async getCollegeSuccessLeaderboard(opts: CollegeScoutOptions = {}): Promise<CollegeSuccessRow[]> {
    const {startYear, endYear} = resolveScoutYearRange(opts);
    const useContractBonus = (opts.mode ?? 'career') === 'career';
    const statModel = opts.statModel ?? DEFAULT_STAT_MODEL;
    const gradeFormula = opts.gradeFormula ?? DEFAULT_GRADE_FORMULA;

    const db = getDB();

    const [{ratingFor, applyContractBonus: lensAllowsBonus, expectedByRound}, picks] = await Promise.all([
      resolveCollegeRatingMap(opts),
      db
        .select()
        .from(officialDraftResults)
        .where(and(gte(officialDraftResults.year, startYear), lte(officialDraftResults.year, endYear))),
    ]);

    const allPickDeltas: number[] = [];

    const collegeAgg: Record<
      string,
      {
        totalPicks: number;
        hits: number;
        busts: number;
        eliteCount: number;
        discoverySum: number;
        deltaSum: number;
        premiumWeighted: number;
        premiumW: number;
        slotWeighted: number;
        slotW: number;
        bestLens: number;
        bestPick?: CollegeSuccessRow['topPro'];
      }
    > = {};

    for (const p of picks) {
      const college = p.college?.trim();
      if (!college || !p.round || !p.playerName) {continue;}

      const rating = ratingFor(p.playerName);
      if (rating === undefined || rating === null) {continue;}

      const applyBonus = lensAllowsBonus && useContractBonus;
      const perf = applyBonus ? LLLRatingEngine.applyContractBonus(rating, p.contractOutcome) : rating;
      const delta = LLLRatingEngine.calculateFinalGrade(perf, p.round, expectedByRound);
      allPickDeltas.push(delta);

      const cw = pickCapitalWeight(p.round);
      const sw = pickSlotTradeWeight(p.round, p.pickNumber);

      if (!collegeAgg[college]) {
        collegeAgg[college] = {
          totalPicks: 0,
          hits: 0,
          busts: 0,
          eliteCount: 0,
          discoverySum: 0,
          deltaSum: 0,
          premiumWeighted: 0,
          premiumW: 0,
          slotWeighted: 0,
          slotW: 0,
          bestLens: -Infinity,
        };
      }

      const agg = collegeAgg[college];
      agg.totalPicks++;
      agg.deltaSum += delta;
      agg.premiumWeighted += delta * cw;
      agg.premiumW += cw;
      agg.slotWeighted += delta * sw;
      agg.slotW += sw;
      if (delta > 0.5) {agg.hits++;}
      if (delta < -1.0) {agg.busts++;}
      // Elite = raw LLL career rating ≥ 9.0 (career scale, not tier scale)
      if (rating >= 9.0) {agg.eliteCount++;}
      // Discovery credit: elite pick with strong value (delta ≥ 2.0)
      if (rating >= 9.0 && delta >= 2.0) {agg.discoverySum += delta;}

      const lm = pickLensMetric(delta, p.round, p.pickNumber, statModel);
      if (lm > agg.bestLens) {
        agg.bestLens = lm;
        agg.bestPick = {name: p.playerName, rating, delta, round: p.round, year: p.year};
      }
    }

    const globalMean = allPickDeltas.length > 0 ? allPickDeltas.reduce((s, d) => s + d, 0) / allPickDeltas.length : 0;
    const shrinkK = 4;

    const interim = Object.entries(collegeAgg)
      .filter(([, a]) => a.totalPicks >= 5)
      .map(([college, a]) => {
        const rawAvg = a.deltaSum / a.totalPicks;
        const premiumAvg = a.premiumW > 0 ? a.premiumWeighted / a.premiumW : rawAvg;
        const slotAvg = a.slotW > 0 ? a.slotWeighted / a.slotW : rawAvg;
        const shrunkAvg =
          (a.totalPicks / (a.totalPicks + shrinkK)) * rawAvg + (shrinkK / (a.totalPicks + shrinkK)) * globalMean;
        let lensAvg = rawAvg;
        if (statModel === 'shrinkage') {lensAvg = shrunkAvg;}
        else if (statModel === 'premium') {lensAvg = premiumAvg;}
        else if (statModel === 'slot_value') {lensAvg = slotAvg;}
        const hitRate = Math.round((a.hits / a.totalPicks) * 100);
        return {college, a, lensAvg, hitRate, rawAvg};
      });

    interim.sort((x, y) => y.lensAvg - x.lensAvg);

    // Apply grade formula (same logic as team-scout)
    type InterimItem = (typeof interim)[number] & {compositeScore: number};
    let scored: InterimItem[];

    if (gradeFormula === 'elite_blend') {
      const eliteRates = interim.map((i) => i.a.eliteCount / i.a.totalPicks);
      const minE = Math.min(...eliteRates);
      const maxE = Math.max(...eliteRates);
      const eliteSpan = Math.max(0.001, maxE - minE);
      const lensDeltas = interim.map((i) => i.lensAvg);
      const minD = Math.min(...lensDeltas);
      const maxD = Math.max(...lensDeltas);
      const deltaSpan = Math.max(0.01, maxD - minD);
      scored = interim.map((i) => {
        const normDelta = (i.lensAvg - minD) / deltaSpan;
        const normElite = (i.a.eliteCount / i.a.totalPicks - minE) / eliteSpan;
        return {...i, compositeScore: 0.6 * normDelta + 0.4 * normElite};
      });
      scored.sort((x, y) => y.compositeScore - x.compositeScore);
    } else if (gradeFormula === 'elite_bonus') {
      scored = interim.map((i) => ({
        ...i,
        compositeScore: i.lensAvg + (i.a.eliteCount / i.a.totalPicks) * 1.5,
      }));
      scored.sort((x, y) => y.compositeScore - x.compositeScore);
    } else if (gradeFormula === 'elite_discovery') {
      scored = interim.map((i) => ({
        ...i,
        compositeScore: i.lensAvg + (i.a.discoverySum / i.a.totalPicks) * 0.5,
      }));
      scored.sort((x, y) => y.compositeScore - x.compositeScore);
    } else {
      scored = interim.map((i) => ({...i, compositeScore: i.lensAvg}));
    }

    const scores = scored.map((i) => i.compositeScore);
    const maxS = Math.max(...scores);
    const minS = Math.min(...scores);
    const scoreSpan = Math.max(0.01, maxS - minS);

    return scored.map((i) => ({
      college: i.college,
      totalPicks: i.a.totalPicks,
      hits: i.a.hits,
      busts: i.a.busts,
      eliteCount: i.a.eliteCount,
      hitRate: i.hitRate,
      avgDelta: Number(i.lensAvg.toFixed(2)),
      value: Math.round(((i.compositeScore - minS) / scoreSpan) * 100),
      topPro: i.a.bestPick,
    }));
  }

  static async getCollegePlayers(college: string, opts: CollegeScoutOptions = {}): Promise<CollegePickRow[]> {
    const {startYear, endYear} = resolveScoutYearRange(opts);
    const useContractBonus = (opts.mode ?? 'career') === 'career';

    const db = getDB();

    const [{ratingFor, applyContractBonus: lensAllowsBonus, expectedByRound}, picks] = await Promise.all([
      resolveCollegeRatingMap(opts),
      db
        .select()
        .from(officialDraftResults)
        .where(
          and(
            gte(officialDraftResults.year, startYear),
            lte(officialDraftResults.year, endYear),
            eq(officialDraftResults.college, college),
          ),
        ),
    ]);

    const rows: CollegePickRow[] = [];

    for (const p of picks) {
      if (!p.round || !p.playerName) {continue;}
      const rating = ratingFor(p.playerName);
      if (rating === undefined || rating === null) {continue;}

      const applyBonus = lensAllowsBonus && useContractBonus;
      const perf = applyBonus ? LLLRatingEngine.applyContractBonus(rating, p.contractOutcome) : rating;
      const delta = LLLRatingEngine.calculateFinalGrade(perf, p.round, expectedByRound);
      const outcome = LLLRatingEngine.getGradeOutcomeLabel(delta);

      rows.push({
        playerName: p.playerName,
        round: p.round,
        pickNumber: p.pickNumber,
        year: p.year,
        position: p.position,
        rating: Number(rating.toFixed(2)),
        delta: Number(delta.toFixed(2)),
        outcome,
      });
    }

    rows.sort((a, b) => b.delta - a.delta);
    return rows;
  }
}
