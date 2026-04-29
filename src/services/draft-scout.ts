import {getDB} from '../db/index.js';
import {expertRankings, playerPerformanceRatings, experts, officialDraftResults} from '../db/schema.js';
import {eq, and, gte, sql} from 'drizzle-orm';
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
    // Use the normalized per-season rating so 2024 rookies aren't unfairly punished
    // vs 2015 vets. Pulls w_av from metadata when present; falls back to raw rating.
    const evalYear = new Date().getFullYear();
    const yearlyScores = performance.map((p) => {
      const wav = (p.metadata as {wav?: number} | null)?.wav;
      if (typeof wav === 'number') {
        const yearsSince = Math.max(1, evalYear - p.draftYear);
        return LLLRatingEngine.normalizeWavToRating(wav, yearsSince);
      }
      return p.rating;
    });
    const performanceScore = LLLRatingEngine.calculateFinalPerformanceScore(
      yearlyScores,
      officialPick?.contractOutcome || undefined,
    );
    const finalGrade = LLLRatingEngine.calculateFinalGrade(performanceScore, round);
    const outcome = LLLRatingEngine.getGradeOutcomeLabel(finalGrade);

    // 5. Calculate "Expert Accuracy" for this specific player.
    // Compare each expert's implied talent rating (from their big-board rank)
    // against the player's actual normalized career rating.
    const expertAccuracy = rankings.map((r) => {
      const implied = r.rank ? LLLRatingEngine.rankToExpectedRating(r.rank) : null;
      const ratingPerf = performanceScore;
      const closeEnough = implied !== null && Math.abs(implied - ratingPerf) < 1.5;
      return {
        expert: r.expertName,
        predictedRank: r.rank,
        impliedRating: implied,
        actualSuccess: LLLRatingEngine.getRatingLabel(performanceScore),
        isAccurate: closeEnough,
      };
    });
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

  /**
   * Performs a global search across players, experts, and teams using ILIKE
   * (Standard Postgres fuzzy search).
   */
  static async search(query: string) {
    const db = getDB();
    const cleanQuery = query.trim();
    if (cleanQuery.length < 2) {
      return {players: [], experts: []};
    }

    const players = await db
      .select({
        name: officialDraftResults.playerName,
        year: officialDraftResults.year,
        team: officialDraftResults.teamName,
      })
      .from(officialDraftResults)
      .where(sql`player_name ILIKE ${'%' + cleanQuery + '%'}`)
      .limit(10);

    const expertMatches = await db
      .select({
        name: experts.name,
        slug: experts.slug,
        org: experts.organization,
      })
      .from(experts)
      .where(sql`name ILIKE ${'%' + cleanQuery + '%'}`)
      .limit(5);

    return {players, experts: expertMatches};
  }
}
