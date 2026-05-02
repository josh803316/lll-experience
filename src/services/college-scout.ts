import {getDB} from '../db/index.js';
import {officialDraftResults} from '../db/schema.js';
import {gte, lte, and} from 'drizzle-orm';
import type {StatModelId} from '../config/analyzer-stat-models.js';
import {DEFAULT_STAT_MODEL} from '../config/analyzer-stat-models.js';
import {
  pickCapitalWeight,
  pickLensMetric,
  pickSlotTradeWeight,
  resolveScoutYearRange,
  type ScoutMode,
} from './team-scout.js';
import {LLLRatingEngine, PlayerPerformanceRegistry} from './lll-rating-engine.js';

export interface CollegeSuccessRow {
  college: string;
  totalPicks: number;
  hits: number;
  busts: number;
  hitRate: number;
  avgDelta: number;
  value: number;
  topPro?: {name: string; rating: number; delta: number; round: number; year: number};
}

export interface CollegeScoutOptions {
  mode?: ScoutMode;
  season?: number;
  window?: number;
  statModel?: StatModelId;
}

export class CollegeScoutService {
  /**
   * Aggregate college performance — same year window and statistical lens as Franchise Index.
   */
  static async getCollegeSuccessLeaderboard(opts: CollegeScoutOptions = {}): Promise<CollegeSuccessRow[]> {
    const {startYear, endYear} = resolveScoutYearRange(opts);
    const useContractBonus = (opts.mode ?? 'career') === 'career';
    const statModel = opts.statModel ?? DEFAULT_STAT_MODEL;

    const db = getDB();

    const [ratingMap, picks] = await Promise.all([
      PlayerPerformanceRegistry.getCareerRatingMap(),
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
      if (!college || !p.round || !p.playerName) {
        continue;
      }

      const rating = ratingMap.get(LLLRatingEngine.normalizeName(p.playerName));
      if (rating === undefined || rating === null) {
        continue;
      }

      const perf = LLLRatingEngine.applyContractBonus(rating, useContractBonus ? p.contractOutcome : null);
      const delta = LLLRatingEngine.calculateFinalGrade(perf, p.round);
      allPickDeltas.push(delta);

      const cw = pickCapitalWeight(p.round);
      const sw = pickSlotTradeWeight(p.round, p.pickNumber);

      if (!collegeAgg[college]) {
        collegeAgg[college] = {
          totalPicks: 0,
          hits: 0,
          busts: 0,
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
      if (delta > 0.5) {
        agg.hits++;
      }
      if (delta < -1.0) {
        agg.busts++;
      }

      const lm = pickLensMetric(delta, p.round, p.pickNumber, statModel);
      if (lm > agg.bestLens) {
        agg.bestLens = lm;
        agg.bestPick = {name: p.playerName, rating, delta, round: p.round, year: p.year};
      }
    }

    const globalMean = allPickDeltas.length > 0 ? allPickDeltas.reduce((s, d) => s + d, 0) / allPickDeltas.length : 0;
    const shrinkK = 4;

    const result = Object.entries(collegeAgg)
      .filter(([, a]) => a.totalPicks >= 5)
      .map(([college, a]) => {
        const rawAvg = a.deltaSum / a.totalPicks;
        const premiumAvg = a.premiumW > 0 ? a.premiumWeighted / a.premiumW : rawAvg;
        const slotAvg = a.slotW > 0 ? a.slotWeighted / a.slotW : rawAvg;
        const shrunkAvg =
          (a.totalPicks / (a.totalPicks + shrinkK)) * rawAvg + (shrinkK / (a.totalPicks + shrinkK)) * globalMean;
        let lensAvg = rawAvg;
        if (statModel === 'shrinkage') {
          lensAvg = shrunkAvg;
        } else if (statModel === 'premium') {
          lensAvg = premiumAvg;
        } else if (statModel === 'slot_value') {
          lensAvg = slotAvg;
        }
        const hitRate = Math.round((a.hits / a.totalPicks) * 100);
        return {
          college,
          totalPicks: a.totalPicks,
          hits: a.hits,
          busts: a.busts,
          hitRate,
          avgDelta: Number(lensAvg.toFixed(2)),
          topPro: a.bestPick,
        };
      });

    result.sort((x, y) => y.avgDelta - x.avgDelta);

    const deltas = result.map((i) => i.avgDelta);
    const maxD = Math.max(...deltas);
    const minD = Math.min(...deltas);
    const span = Math.max(0.01, maxD - minD);

    return result.map((i) => ({
      ...i,
      value: Math.round(((i.avgDelta - minD) / span) * 100),
    }));
  }
}
