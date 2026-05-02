/**
 * Prototype: pairwise concordance vs post-hoc career strength (PlayerPerformanceRegistry).
 * For each expert and draft year, count unordered player pairs (A,B) where both appear on
 * the expert's board and have a career rating: expert order matches LLL career order.
 * Complements RMSE — ordinal agreement on relative talent, not slot distance.
 */

import {getDB} from '../db/index.js';
import {experts, expertRankings, playerPerformanceRatings} from '../db/schema.js';
import {eq, lte} from 'drizzle-orm';
import {LLLRatingEngine, PlayerPerformanceRegistry} from './lll-rating-engine.js';

const LATEST_FAIR_DRAFT_YEAR = 2023;

export interface ExpertPairwiseRow {
  expertSlug: string;
  expertName: string;
  org: string | null;
  /** Fraction of non-tie pairs where board order matches career-rating order. */
  pairAccuracy: number;
  /** Number of informative pairs (excludes ties on rank or rating). */
  pairCount: number;
  yearsCovered: number[];
}

/**
 * For one expert-year list of {rank, rating}, count concordant pairs.
 */
export function countPairwiseConcordant(rows: Array<{rank: number; rating: number}>): {correct: number; total: number} {
  const list = rows.filter((r) => r.rank > 0 && Number.isFinite(r.rating));
  if (list.length < 2) {
    return {correct: 0, total: 0};
  }
  let correct = 0;
  let total = 0;
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i];
      const b = list[j];
      if (a.rank === b.rank) {
        continue;
      }
      if (Math.abs(a.rating - b.rating) < 1e-6) {
        continue;
      }
      total++;
      // Lower rank number = higher on board = predicted "better"
      const expertPrefersFirst = a.rank < b.rank;
      const truthPrefersFirst = a.rating > b.rating;
      if (expertPrefersFirst === truthPrefersFirst) {
        correct++;
      }
    }
  }
  return {correct, total};
}

export class ExpertPairwiseRankService {
  static async getPairwiseLeaderboard(): Promise<ExpertPairwiseRow[]> {
    const evalYear = new Date().getFullYear();
    const db = getDB();
    const [allExperts, allRankings, careerMap] = await Promise.all([
      db.select().from(experts),
      db.select().from(expertRankings).where(lte(expertRankings.year, LATEST_FAIR_DRAFT_YEAR)),
      PlayerPerformanceRegistry.getCareerRatingMap(),
    ]);

    const careerRows = await db
      .select({
        playerName: playerPerformanceRatings.playerName,
        draftYear: playerPerformanceRatings.draftYear,
      })
      .from(playerPerformanceRatings)
      .where(eq(playerPerformanceRatings.isCareerRating, true));
    const draftYearByName = new Map<string, number>();
    for (const r of careerRows) {
      draftYearByName.set(LLLRatingEngine.normalizeName(r.playerName), r.draftYear);
    }

    const ranked: ExpertPairwiseRow[] = [];
    const empty: ExpertPairwiseRow[] = [];

    for (const expert of allExperts) {
      const mine = allRankings.filter((rk) => rk.expertId === expert.id);
      let correctAll = 0;
      let totalAll = 0;
      const yearsSet = new Set<number>();

      const byYear = new Map<number, Array<{rank: number; rating: number}>>();
      for (const rk of mine) {
        if (rk.year > LATEST_FAIR_DRAFT_YEAR || !rk.rank) {
          continue;
        }
        const norm = LLLRatingEngine.normalizeName(rk.playerName);
        const rating = careerMap.get(norm);
        if (rating === undefined) {
          continue;
        }
        const draftYear = draftYearByName.get(norm);
        if (draftYear === undefined) {
          continue;
        }
        if (evalYear - draftYear < 2) {
          continue;
        }
        const arr = byYear.get(rk.year) ?? [];
        arr.push({rank: rk.rank, rating});
        byYear.set(rk.year, arr);
        yearsSet.add(rk.year);
      }

      for (const rows of byYear.values()) {
        const {correct, total} = countPairwiseConcordant(rows);
        correctAll += correct;
        totalAll += total;
      }

      if (totalAll === 0) {
        empty.push({
          expertSlug: expert.slug,
          expertName: expert.name,
          org: expert.organization,
          pairAccuracy: 0,
          pairCount: 0,
          yearsCovered: [],
        });
        continue;
      }

      ranked.push({
        expertSlug: expert.slug,
        expertName: expert.name,
        org: expert.organization,
        pairAccuracy: Number((correctAll / totalAll).toFixed(4)),
        pairCount: totalAll,
        yearsCovered: [...yearsSet].sort(),
      });
    }

    ranked.sort((a, b) => b.pairAccuracy - a.pairAccuracy);
    empty.sort((a, b) => String(a.expertName ?? '').localeCompare(String(b.expertName ?? '')));
    return [...ranked, ...empty];
  }
}
