import {getDB} from '../db/index.js';
import {experts, expertRankings, officialDraftResults} from '../db/schema.js';
import {eq, and} from 'drizzle-orm';
import {LLLRatingEngine} from './lll-rating-engine.js';

export class ExpertAuditService {
  /**
   * Generates the "Oracle" Leaderboard based on RMSE of Mock Drafts
   */
  static async getOracleLeaderboard(year: number) {
    const db = getDB();
    const allExperts = await db.select().from(experts);

    const scores = [];
    for (const expert of allExperts) {
      // Get all predictions for this expert in this year
      const predictions = await db
        .select({
          predicted: expertRankings.rank,
          actual: officialDraftResults.pickNumber,
        })
        .from(expertRankings)
        .innerJoin(officialDraftResults, eq(expertRankings.playerName, officialDraftResults.playerName))
        .where(
          and(
            eq(expertRankings.expertId, expert.id),
            eq(expertRankings.year, year),
            eq(officialDraftResults.year, year),
          ),
        );

      if (predictions.length > 0) {
        const rmse = LLLRatingEngine.calculateRMSE(
          predictions.map((p) => ({
            predicted: p.predicted || 0,
            actual: p.actual || 0,
          })),
        );

        scores.push({
          expertName: expert.name,
          org: expert.organization,
          rmse: rmse.toFixed(2),
          sampleSize: predictions.length,
        });
      }
    }

    return scores.sort((a, b) => Number(a.rmse) - Number(b.rmse));
  }

  /**
   * Generates the "Scout" Leaderboard based on Talent Delta
   * (How well they predicted a player's actual career quality)
   */
  static getScoutLeaderboard() {
    // This will aggregate across the 3-10 year lookback window
    // For now returning mock structure
    return [
      {name: 'Dane Brugler', talentDelta: 0.4, grade: 'A+'},
      {name: 'Daniel Jeremiah', talentDelta: 0.6, grade: 'A'},
      {name: 'Mel Kiper Jr.', talentDelta: 2.1, grade: 'C'},
    ];
  }
}
