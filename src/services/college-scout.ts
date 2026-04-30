import {getDB} from '../db/index.js';
import {officialDraftResults, playerPerformanceRatings} from '../db/schema.js';
import {eq, gte, lte, and} from 'drizzle-orm';
import {LLLRatingEngine, EXPECTED_VALUE_BY_ROUND, type AwardFlags} from './lll-rating-engine.js';

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

    // 1. Load all ratings first to avoid N+1
    const [seasonRows, careerRows, picks] = await Promise.all([
      db
        .select({
          playerName: playerPerformanceRatings.playerName,
          rating: playerPerformanceRatings.rating,
          metadata: playerPerformanceRatings.metadata,
        })
        .from(playerPerformanceRatings)
        .where(eq(playerPerformanceRatings.isCareerRating, false)),
      db
        .select({
          playerName: playerPerformanceRatings.playerName,
          draftYear: playerPerformanceRatings.draftYear,
          metadata: playerPerformanceRatings.metadata,
        })
        .from(playerPerformanceRatings)
        .where(eq(playerPerformanceRatings.isCareerRating, true)),
      db
        .select()
        .from(officialDraftResults)
        .where(and(gte(officialDraftResults.year, startYear), lte(officialDraftResults.year, endYear))),
    ]);

    // 2. Build Rating Map (standard logic from TeamScout but we need it here)
    const ratingMap = new Map<string, number>();
    const seasonsByName = new Map<string, number[]>();

    for (const r of seasonRows) {
      const key = LLLRatingEngine.normalizeName(r.playerName);
      const awards = (r.metadata as {awards?: AwardFlags} | null)?.awards;
      const final = LLLRatingEngine.applyAwardFloor(r.rating, awards);
      const list = seasonsByName.get(key) ?? [];
      list.push(final);
      seasonsByName.set(key, list);
    }

    for (const [key, ratings] of seasonsByName) {
      const sorted = [...ratings].sort((a, b) => b - a);
      const top4 = sorted.slice(0, 4);
      const avg = top4.reduce((s, r) => s + r, 0) / top4.length;
      ratingMap.set(key, Number(avg.toFixed(2)));
    }

    const evalYear = new Date().getFullYear();
    for (const r of careerRows) {
      const key = LLLRatingEngine.normalizeName(r.playerName);
      if (ratingMap.has(key)) {
        continue;
      }
      const wav = (r.metadata as {wav?: number} | null)?.wav ?? 0;
      const ysd = Math.max(1, evalYear - r.draftYear);
      ratingMap.set(key, LLLRatingEngine.normalizeWavToRating(wav, ysd));
    }

    // 3. Aggregate by College
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
