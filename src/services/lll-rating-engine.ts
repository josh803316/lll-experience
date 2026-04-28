/**
 * LLL Proprietary Rating Engine
 * Handles the logic for the 0-10 draft success scale and
 * proprietary multi-source value algorithms.
 */

export interface LLLRatingDefinition {
  value: number;
  label: string;
  description: string;
}

export const LLL_RATING_SCALE: Record<number, LLLRatingDefinition> = {
  10: {value: 10, label: 'Franchise', description: 'Cornerstone player, face of the franchise'},
  9: {value: 9, label: 'Top 5', description: 'Elite performer, top 5 at their position'},
  8: {value: 8, label: 'Top 10', description: 'Great starter, top 10 at their position'},
  7: {value: 7, label: 'All-Star', description: 'Key player, Pro-Bowl caliber'},
  6: {value: 6, label: 'Contributor', description: 'Solid contributor, important to team success'},
  5: {value: 5, label: 'Rotational', description: 'Average starter, specialist, or rotational player'},
  4: {value: 4, label: 'Below Avg', description: 'Just below average but still plays'},
  3: {value: 3, label: 'Backup', description: 'Average quality backup'},
  2: {value: 2, label: 'Replaceable', description: 'Backup who could easily be replaced'},
  1: {value: 1, label: 'Roster', description: 'Made the roster or practice squad'},
  0: {value: 0, label: 'Cut', description: 'Released from the team'},
};

export const EXPECTED_VALUE_BY_ROUND: Record<number, number> = {
  1: 7.5, // Averaging 8/7 as 7.5 for baseline, or we can use 8.0 for top tier
  2: 6.0,
  3: 5.0,
  4: 4.0,
  5: 3.0,
  6: 2.0,
  7: 1.0,
};

export const CONTRACT_BONUSES: Record<string, number> = {
  TOP_OF_MARKET: 2.0,
  MARKET_OR_ABOVE: 1.5,
  OTHER_TEAM_PAID: 1.0,
  FIFTH_YEAR_PICKED_UP: 0.5,
  WALKED_FOR_CHEAP: 0,
  CUT_BEFORE_END: -1.0,
  CUT_FIRST_2_YEARS: -2.0,
};

export class LLLRatingEngine {
  /**
   * Calculates a single season's score based on the 30/30/40 split.
   */
  static calculateSeasonScore(peerScore: number, prodScore: number, roleScore: number): number {
    return peerScore * 0.3 + prodScore * 0.3 + roleScore * 0.4;
  }

  /**
   * Option B: Best 4 of 6 Average + Trajectory + Contract
   */
  static calculateFinalPerformanceScore(yearlyScores: number[], contractType?: string): number {
    if (yearlyScores.length === 0) {return 0;}

    // 1. Take best 4 of 6 (or fewer if career is shorter)
    const sorted = [...yearlyScores].sort((a, b) => b - a);
    const best4 = sorted.slice(0, 4);
    const avgBest4 = best4.reduce((a, b) => a + b, 0) / best4.length;

    // 2. Trajectory Modifier
    const trajectoryMod = this.calculateTrajectoryModifier(yearlyScores);

    // 3. Contract Bonus
    const contractBonus = contractType ? CONTRACT_BONUSES[contractType] || 0 : 0;

    return Number((avgBest4 + trajectoryMod + contractBonus).toFixed(2));
  }

  private static calculateTrajectoryModifier(scores: number[]): number {
    if (scores.length < 2) {return 0;}

    // Final 2 years
    const final2 = scores.slice(-2);
    const others = scores.slice(0, -2);

    if (others.length === 0) {return 0;}

    // Ascending: Both final 2 are better than any of the previous?
    // Simplified: are the final 2 higher than the average of previous?
    const avgOthers = others.reduce((a, b) => a + b, 0) / others.length;
    const avgFinal2 = final2.reduce((a, b) => a + b, 0) / final2.length;

    if (avgFinal2 > avgOthers + 1.5) {return 0.5;} // Ascending
    if (avgFinal2 < avgOthers - 1.5) {return -0.5;} // Declining
    return 0;
  }

  /**
   * Player Grade = Actual Performance Score − Expected Score (by round)
   */
  static calculateFinalGrade(performanceScore: number, round: number): number {
    const expected = EXPECTED_VALUE_BY_ROUND[round] || 0;
    return Number((performanceScore - expected).toFixed(2));
  }

  /**
   * Map Delta to descriptive label
   */
  static getGradeOutcomeLabel(delta: number): string {
    if (delta >= 1.5) {return 'ELITE HIT';}
    if (delta > 0.5) {return 'HIT';}
    if (delta >= -0.5) {return 'MET EXPECTATION';}
    if (delta >= -1.5) {return 'UNDERPERFORMED';}
    return 'BUST';
  }

  static getRatingLabel(rating: number): string {
    return LLL_RATING_SCALE[Math.round(rating)]?.label || 'Unknown';
  }

  /**
   * Mock Accuracy: Root Mean Square Error (RMSE)
   * Measures how close an expert's predicted slot was to the actual slot.
   * Lower is better (0 = perfect).
   */
  static calculateRMSE(predictions: {predicted: number; actual: number}[]): number {
    if (predictions.length === 0) {
      return 0;
    }
    const sumOfSquares = predictions.reduce((sum, p) => {
      return sum + Math.pow(p.predicted - p.actual, 2);
    }, 0);
    return Math.sqrt(sumOfSquares / predictions.length);
  }

  /**
   * Scouting Accuracy: The "Talent Delta"
   * Compares an expert's pre-draft grade (converted to 0-10) to the LLL Career Rating.
   * Measures if they were "right" about the player's quality.
   */
  static calculateTalentDelta(expertGradeScale: number, lllCareerRating: number): number {
    // 0 = perfect prediction, positive = expert overhyped, negative = expert undervalued
    return expertGradeScale - lllCareerRating;
  }

  /**
   * Maps a Letter Grade (A, B, C...) to our 0-10 scale for comparison.
   */
  static mapLetterGradeToScale(grade: string): number {
    const mapping: Record<string, number> = {
      'A+': 10,
      A: 9.5,
      'A-': 9,
      'B+': 8.5,
      B: 7.5,
      'B-': 7,
      'C+': 6.5,
      C: 5.5,
      'C-': 5,
      'D+': 4,
      D: 3,
      F: 0,
    };
    return mapping[grade.toUpperCase()] || 5;
  }
}
