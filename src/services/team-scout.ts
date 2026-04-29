import {getDB} from '../db/index.js';
import {officialDraftResults, playerPerformanceRatings} from '../db/schema.js';
import {eq, sql} from 'drizzle-orm';
import {LLLRatingEngine} from './lll-rating-engine.js';

export class TeamScoutService {
  /**
   * Calculates real-world LLL metrics for all 32 teams based on the last 5 years of data.
   */
  static async getTeamSuccessLeaderboard() {
    const db = getDB();
    
    // 1. Get all picks since 2020 for a relevant "Rolling" window
    const picks = await db.select({
      teamName: officialDraftResults.teamName,
      round: officialDraftResults.round,
      contractOutcome: officialDraftResults.contractOutcome,
      playerName: officialDraftResults.playerName
    })
    .from(officialDraftResults)
    .where(sql`year >= 2019`);

    // 2. Get all career ratings
    const ratings = await db.select().from(playerPerformanceRatings).where(eq(playerPerformanceRatings.isCareerRating, true));
    const ratingMap = new Map(ratings.map(r => [r.playerName, r.rating]));

    // 3. Aggregate by Team
    const teamStats: Record<string, { totalPicks: number, hits: number, totalValue: number, retentionCount: number }> = {};

    for (const p of picks) {
      const team = p.teamName || 'Unknown';
      if (!teamStats[team]) teamStats[team] = { totalPicks: 0, hits: 0, totalValue: 0, retentionCount: 0 };
      
      const stats = teamStats[team];
      stats.totalPicks++;

      // Retention check: Did they get a 2nd contract with original team?
      if (p.contractOutcome === 'TOP_OF_MARKET' || p.contractOutcome === 'MARKET_OR_ABOVE') {
        stats.retentionCount++;
      }

      // Value check: LLL Grade
      const careerRating = ratingMap.get(p.playerName || '') || 5; // Default to mid if unknown
      const performanceScore = LLLRatingEngine.calculateFinalPerformanceScore([careerRating], p.contractOutcome || undefined);
      const gradeDelta = LLLRatingEngine.calculateFinalGrade(performanceScore, p.round || 4);
      
      stats.totalValue += gradeDelta;
      if (gradeDelta > 0.5) stats.hits++;
    }

    // 4. Format for UI
    return Object.entries(teamStats)
      .map(([name, s]) => {
        const retention = Math.round((s.retentionCount / s.totalPicks) * 100) || 40; // Floor for visual
        const avgValue = Number((s.totalValue / s.totalPicks).toFixed(2));
        // Map to A-F scale based on avgValue
        let grade = 'F';
        if (avgValue >= 1.5) grade = 'A+';
        else if (avgValue >= 1.2) grade = 'A';
        else if (avgValue >= 0.9) grade = 'A-';
        else if (avgValue >= 0.6) grade = 'B+';
        else if (avgValue >= 0.3) grade = 'B';
        else if (avgValue >= 0.0) grade = 'B-';
        else if (avgValue >= -0.3) grade = 'C+';
        else if (avgValue >= -0.6) grade = 'C';
        else if (avgValue >= -0.9) grade = 'C-';
        else if (avgValue >= -1.2) grade = 'D+';
        else if (avgValue >= -1.5) grade = 'D';

        return {
          team: name,
          retention: retention,
          value: Math.max(0, Math.round((avgValue + 1) * 40)), // Normalized for bar
          grade: grade,
          avgDelta: avgValue
        };
        })

      .sort((a, b) => b.avgDelta - a.avgDelta);
  }
}
