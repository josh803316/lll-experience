import {getDB} from '../db/index.js';
import {expertRankings, playerPerformanceRatings, experts} from '../db/schema.js';
import {eq, and, gte} from 'drizzle-orm';
import {LLLRatingEngine} from './lll-rating-engine.js';

export class DraftScoutService {
  /**
   * Generates a comprehensive report for a player including historical expert rankings
   * and LLL performance ratings.
   */
  static async getPlayerCareerProfile(playerName: string, startYear: number = 2023) {
    const db = getDB();

    // 1. Get all expert rankings for this player
    const rankings = await db
      .select({
        expertName: experts.name,
        expertOrg: experts.organization,
        year: expertRankings.year,
        rank: expertRankings.rank,
        grade: expertRankings.grade,
        commentary: expertRankings.commentary,
      })
      .from(expertRankings)
      .innerJoin(experts, eq(expertRankings.expertId, experts.id))
      .where(and(eq(expertRankings.playerName, playerName), gte(expertRankings.year, startYear)));

    // 2. Get LLL Performance Ratings over time
    const performance = await db
      .select()
      .from(playerPerformanceRatings)
      .where(
        and(eq(playerPerformanceRatings.playerName, playerName), gte(playerPerformanceRatings.draftYear, startYear)),
      )
      .orderBy(playerPerformanceRatings.evaluationYear);

    // 3. Calculate "Expert Accuracy" for this specific player
    // Compare expert grade/rank to the final LLL performance rating
    const latestRating = performance[performance.length - 1]?.rating || 0;

    const expertAccuracy = rankings.map((r) => ({
      expert: r.expertName,
      predictedRank: r.rank,
      actualSuccess: LLLRatingEngine.getRatingLabel(latestRating),
      isAccurate: Math.abs((r.rank || 0) - latestRating * 10) < 20, // Simple delta for now
    }));

    return {
      playerName,
      careerRating: latestRating,
      careerStatus: LLLRatingEngine.getRatingLabel(latestRating),
      performanceHistory: performance,
      expertRankings: rankings,
      accuracySummary: expertAccuracy,
    };
  }
}
