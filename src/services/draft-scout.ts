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

    // 3. Get Draft Round for Expectation (fetch from official results)
    const officialPick = (
      await db.select().from(officialDraftResults).where(eq(officialDraftResults.playerName, playerName)).limit(1)
    )[0];
    const round = officialPick?.round || 1;

    // 4. Calculate Final LLL Score & Final Grade (Option B)
    const yearlyScores = performance.map((p) => p.rating);
    const performanceScore = LLLRatingEngine.calculateFinalPerformanceScore(
      yearlyScores,
      officialPick?.contractOutcome || undefined,
    );
    const finalGrade = LLLRatingEngine.calculateFinalGrade(performanceScore, round);
    const outcome = LLLRatingEngine.getGradeOutcomeLabel(finalGrade);

    // 5. Calculate "Expert Accuracy" for this specific player
    const expertAccuracy = rankings.map((r) => ({
      expert: r.expertName,
      predictedRank: r.rank,
      actualSuccess: LLLRatingEngine.getRatingLabel(performanceScore),
      isAccurate: Math.abs((r.rank || 0) - performanceScore * 10) < 20,
    }));

    return {
      playerName,
      round,
      weightedScore: performanceScore,
      finalGrade,
      outcome,
      performanceHistory: performance,
      expertRankings: rankings,
      accuracySummary: expertAccuracy,
      contractOutcome: officialPick?.contractOutcome,
    };
  }
}
