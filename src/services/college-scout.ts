import {getDB} from '../db/index.js';
import {officialDraftResults} from '../db/schema.js';
import {gte, lte, and} from 'drizzle-orm';
import {LLLRatingEngine, PlayerPerformanceRegistry} from './lll-rating-engine.js';

const LATEST_FAIR_DRAFT_YEAR = 2023;
const DEFAULT_WINDOW = 10; // Colleges need a larger window for significant sample sizes

export interface CollegeSuccessRow {
  college: string;
  totalPicks: number;
  hits: number;
  busts: number;
  hitRate: number;
  avgDelta: number;
  value: number; // 0-100 score for UI
  topPro?: {name: string; rating: number; delta: number; round: number; year: number};
}

export interface CollegeScoutOptions {
  window?: number;
  endYear?: number;
}

export class CollegeScoutService {
  /**
   * Aggregate college performance by comparing their drafted players'
   * actual NFL performance against their draft slot expectation.
   */
  static async getCollegeSuccessLeaderboard(opts: CollegeScoutOptions = {}): Promise<CollegeSuccessRow[]> {
    const window = opts.window ?? DEFAULT_WINDOW;
    const endYear = opts.endYear ?? LATEST_FAIR_DRAFT_YEAR;
    const startYear = endYear - window + 1;

    const db = getDB();

    // 1. Use the centralized registry (eliminates redundant DB queries and calculations)
    const [ratingMap, picks] = await Promise.all([
      PlayerPerformanceRegistry.getCareerRatingMap(),
      db
        .select()
        .from(officialDraftResults)
        .where(and(gte(officialDraftResults.year, startYear), lte(officialDraftResults.year, endYear))),
    ]);

    // 2. Aggregate by College

    const collegeAgg: Record<
      string,
      {
        totalPicks: number;
        hits: number;
        busts: number;
        deltaSum: number;
        bestDelta: number;
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

      const perf = LLLRatingEngine.applyContractBonus(rating, p.contractOutcome);
      const delta = LLLRatingEngine.calculateFinalGrade(perf, p.round);

      if (!collegeAgg[college]) {
        collegeAgg[college] = {
          totalPicks: 0,
          hits: 0,
          busts: 0,
          deltaSum: 0,
          bestDelta: -Infinity,
        };
      }

      const agg = collegeAgg[college];
      agg.totalPicks++;
      agg.deltaSum += delta;
      if (delta > 0.5) {
        agg.hits++;
      }
      if (delta < -1.0) {
        agg.busts++;
      }

      if (delta > agg.bestDelta) {
        agg.bestDelta = delta;
        agg.bestPick = {name: p.playerName, rating, delta, round: p.round, year: p.year};
      }
    }

    // 4. Finalize and Filter (only colleges with enough picks to be meaningful)
    const result = Object.entries(collegeAgg)
      .filter(([_, a]) => a.totalPicks >= 5)
      .map(([college, a]) => {
        const avgDelta = Number((a.deltaSum / a.totalPicks).toFixed(2));
        const hitRate = Math.round((a.hits / a.totalPicks) * 100);
        return {
          college,
          totalPicks: a.totalPicks,
          hits: a.hits,
          busts: a.busts,
          hitRate,
          avgDelta,
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
